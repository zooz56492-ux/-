/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, writeBatch, onSnapshot } from 'firebase/firestore';
import { UserProfile as UserProfileType, ServerInstance, ChatRoom } from './types';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import UserProfile from './components/UserProfile';
import ServerDirectory from './components/ServerDirectory';
import { MessageSquare, ShieldCheck, Mail, LogOut, Search, Compass, LogIn, Sparkles, AlertCircle, Copy, Check, Users, Globe, Lock, User } from 'lucide-react';

export default function App() {
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<UserProfileType | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active navigation states
  const [activeServer, setActiveServer] = useState<ServerInstance | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);

  // Overlays / Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDirectoryModal, setShowDirectoryModal] = useState(false);

  // Invite parameter flows
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteServer, setInviteServer] = useState<ServerInstance | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);
  const [inviteJoinedPassed, setInviteJoinedPassed] = useState(false);

  // User's joined servers (for directory state coordination)
  const [joinedServers, setJoinedServers] = useState<any[]>([]);

  // 1. Listen to joined servers for index synchronization
  useEffect(() => {
    if (!user) {
      setJoinedServers([]);
      return;
    }
    const joinedRef = collection(db, 'users', user.uid, 'joinedServers');
    const unsubscribe = onSnapshot(joinedRef, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push(doc.data());
      });
      setJoinedServers(list);
    }, (error) => {
      console.error('Error listing joined servers in App:', error);
    });
    return () => unsubscribe();
  }, [user]);

  // 1. Detect invite code in URL query string on boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code.toUpperCase());
    }
  }, []);

  // 2. Fetch invite server details if invite code exists
  useEffect(() => {
    if (!inviteCode) return;

    async function checkInvite() {
      setInviteChecking(true);
      try {
        const q = query(collection(db, 'servers'), where('inviteCode', '==', inviteCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setInviteServer({ id: docSnap.id, ...docSnap.data() } as ServerInstance);
        } else {
          setInviteServer(null);
        }
      } catch (error) {
        console.error('Error checking invite code:', error);
      } finally {
        setInviteChecking(false);
      }
    }
    checkInvite();
  }, [inviteCode]);

  // 3. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
        // Create or load profile
        const userRef = doc(db, 'users', authUser.uid);
        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            setMyProfile(snap.data() as UserProfileType);
          } else {
            // Document doesn't exist, create automatically
            const newProfile: UserProfileType = {
              uid: authUser.uid,
              displayName: authUser.displayName || 'کاربر هم‌گپ',
              photoURL: authUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${authUser.uid}`,
              email: authUser.email || '',
              bio: 'سلام! من به پلتفرم هم‌گپ پیوستم.',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            await setDoc(userRef, newProfile);
            setMyProfile(newProfile);
          }
        } catch (error) {
          console.error('Error fetching/setting profile:', error);
        }
      } else {
        setUser(null);
        setMyProfile(null);
        setActiveServer(null);
        setActiveRoom(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 4. Automatically process outstanding invitation if user logs in
  useEffect(() => {
    if (user && inviteServer && !inviteJoinedPassed) {
      // Look up if user is already a member
      async function checkAlreadyMember() {
        const memberRef = doc(db, 'servers', inviteServer.id, 'members', user.uid);
        try {
          const memberSnap = await getDoc(memberRef);
          if (memberSnap.exists()) {
            // Already member, select server and clear URL params
            setActiveServer(inviteServer);
            setInviteCode(null);
            setInviteServer(null);
            // Clear URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error(error);
        }
      }
      checkAlreadyMember();
    }
  }, [user, inviteServer, inviteJoinedPassed]);

  // Handle Google Login
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error during Google authentication:', error);
    }
  };

  // Logout
  const handleLogout = async () => {
    if (window.confirm('آیا می‌خواهید از حساب کاربری خود خارج شوید؟')) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
  };

  // Join server from Invitation Card
  const handleAcceptInvite = async () => {
    if (!user || !inviteServer) return;

    try {
      const batch = writeBatch(db);

      // 1. Write member subcollection record
      const memberRef = doc(db, 'servers', inviteServer.id, 'members', user.uid);
      batch.set(memberRef, {
        role: 'member',
        displayName: myProfile?.displayName || user.displayName || 'کاربر',
        photoURL: myProfile?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
        joinedAt: new Date()
      });

      // 2. Index in user's joined servers profile subcollection
      const joinedRef = doc(db, 'users', user.uid, 'joinedServers', inviteServer.id);
      batch.set(joinedRef, {
        serverId: inviteServer.id,
        serverName: inviteServer.name,
        inviteCode: inviteServer.inviteCode,
        joinedAt: new Date()
      });

      await batch.commit();

      setInviteJoinedPassed(true);
      setActiveServer(inviteServer);
      
      // Clean up URL query parameters
      setInviteCode(null);
      setInviteServer(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `servers/${inviteServer.id}/members/${user.uid}`);
    }
  };

  // Re-load application state after joining an item from directory
  const handleDirectoryJoin = (server: ServerInstance) => {
    setActiveServer(server);
  };

  // Refreshed current user profile listings
  const handleProfileUpdate = (profile: UserProfileType) => {
    setMyProfile(profile);
  };

  // Loading indicator on authentication processes
  if (authLoading) {
    return (
      <div id="full-loading-screen" className="fixed inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-100 rtl">
        <div className="relative mb-6">
          <div className="h-16 w-16 animate-spin border-4 border-emerald-500 border-t-transparent rounded-full"></div>
          <MessageSquare className="w-6 h-6 text-emerald-500 absolute inset-0 m-auto" />
        </div>
        <p className="text-slate-400 font-bold text-sm animate-pulse">هم‌گپ: در حال اتصال به شبکه درگاه امن...</p>
      </div>
    );
  }

  // unauthenticated view
  if (!user) {
    return (
      <div id="welcome-login-screen" className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-100 p-4 rtl select-none relative overflow-hidden">
        
        {/* Abstract Background Accents */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-slate-800/20 rounded-full blur-3xl"></div>

        {/* Dynamic Invitation Gateway View */}
        {inviteCode && inviteServer ? (
          <div id="invite-gateway-box" className="z-10 w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-6 duration-300">
            <div className="w-16 h-16 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center shadow-lg mb-4">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>

            <span className="px-3 py-1 bg-amber-500/10 font-bold border border-amber-900/30 text-amber-400 text-xs rounded-full mb-4">
              دعوت‌نامه رسمی عضویت دریافت شد!
            </span>

            <h2 className="text-2xl font-black text-slate-100 line-clamp-1 mb-2">به سرور «{inviteServer.name}» بپیوندید</h2>
            <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
              توسط <strong className="text-emerald-400">{inviteServer.ownerName}</strong> دعوت شده‌اید تا در این تالار گفتگو با دیگران به مکالمه بپردازید. ابتدا باید وارد شوید.
            </p>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl w-full mb-6 text-right">
              <h4 className="text-xs font-bold text-slate-300 mb-1">درباره این سرور:</h4>
              <p className="text-xs text-slate-400 leading-normal line-clamp-3">
                {inviteServer.description || 'مکانی جالب برای همنشینی صمیمی اعضا.'}
              </p>
            </div>

            <button
              id="google-login-with-invite"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/15 hover:shadow-emerald-500/30 transition-all text-sm cursor-pointer"
            >
              <LogIn className="w-5 h-5 transform rotate-180" />
              <span>ورود مستقیم با حساب گوگل جهت عضویت</span>
            </button>
          </div>
        ) : inviteCode && !inviteServer && !inviteChecking ? (
          // Invalid invite code display
          <div id="invalid-invite-box" className="z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-6 duration-300">
            <div className="w-16 h-16 rounded-full bg-red-950/45 border border-red-900/30 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>

            <h2 className="text-lg font-black text-slate-100 mb-2">لینک دعوت نادرست است</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              متأسفانه این کد عضویت در پایگاه داده هم‌گپ پیدا نشد یا منحل شده است. لطفاً لینک خود را مجدداً از فرستنده بررسی کنید.
            </p>

            <button
              id="goto-homepage-btn"
              onClick={() => setInviteCode(null)}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
            >
              بازگشت به صفحه اصلی
            </button>
          </div>
        ) : (
          // Standard login view
          <div id="standard-login-box" className="z-10 w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center scale-up duration-300">
            
            <div className="w-20 h-20 bg-gradient-to-tr from-emerald-600/30 to-slate-950 border border-emerald-505/20 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-950/40 mb-6">
              <MessageSquare className="w-10 h-10 text-emerald-500" />
            </div>

            <h1 className="text-3xl font-black text-slate-100 tracking-tight mb-2">هم‌گپ • سرور چت آنلاین</h1>
            <p className="text-xs text-slate-450 leading-relaxed max-w-sm mb-8 text-slate-400">
              یک پلتفرم نوین برای ساخت آسان سرورهای گفتگو، اتاق چت خصوصی با کدهای دعوت منحصربه‌فرد، تالارهای گفتگوی عمومی و ارتباط آنلاین آنی.
            </p>

            {/* Application Features Bulletpoints */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-8 text-right bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>ورود امن و بدون پسوورد با گوگل</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Users className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>ساخت سرورهای چت شخصی</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Lock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>اتاق‌های خصوصی با لینک دعوت</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>تالارهای عمومی جهت ارتباط همگانی</span>
              </div>
            </div>

            <button
              id="google-login-action-btn"
              onClick={handleGoogleLogin}
              className="w-full max-w-md flex items-center justify-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2.5xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/35 transition-all text-sm cursor-pointer"
            >
              <LogIn className="w-5 h-5 transform rotate-180" />
              <span>ورود مستقیم با ایمیل گوگل (Gmail)</span>
            </button>
            
            <p className="text-[10px] text-slate-600 mt-4">ورود شما به منزله تایید شرافت چت و احترام به قوانین تالار کشور است.</p>
          </div>
        )}

      </div>
    );
  }

  // Active / authenticated view
  return (
    <div id="app-workspace" className="h-screen w-screen bg-slate-950 flex flex-col justify-stretch select-none overflow-hidden relative text-right rtl">
      
      {/* 1. Global Navigation Top Header */}
      <header className="h-16 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 z-40 flex-shrink-0">
        
        {/* Branding & Invitation triggers */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-right">
            <h1 className="text-sm font-black text-slate-100">هم‌گپ • HamGap</h1>
            <p className="text-[10px] text-slate-400 font-medium">پایگاه ارتباطی تالار چت‌های زنده</p>
          </div>
        </div>

        {/* Global Toolbar and SignOut */}
        <div className="flex items-center gap-3">
          {myProfile && (
            <button
              id="navbar-edit-profile-btn"
              onClick={() => setShowProfileModal(true)}
              className="text-xs text-slate-300 hover:text-slate-100 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all font-semibold"
            >
              <User className="w-4 h-4 text-emerald-400" />
              <span>پروفایل من</span>
            </button>
          )}

          <button
            id="navbar-server-directory-btn"
            onClick={() => setShowDirectoryModal(true)}
            className="text-xs text-slate-300 bg-emerald-600/10 border border-emerald-505/20 hover:bg-emerald-600/15 text-emerald-450 flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-semibold text-emerald-400"
          >
            <Compass className="w-4 h-4" />
            <span>سرورهای عمومی</span>
          </button>

          <button
            id="navbar-logout-btn"
            onClick={handleLogout}
            title="خروج از حساب"
            className="p-1.5 bg-red-950/25 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Dashboard Layout (Sidebar + Chat Workspace) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {/* Navigation Sidebar */}
        <Sidebar
          onSelectServer={setActiveServer}
          onSelectRoom={setActiveRoom}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenDirectory={() => setShowDirectoryModal(true)}
          activeServer={activeServer}
          activeRoom={activeRoom}
          myProfile={myProfile}
        />

        {/* Real-time chat workspace */}
        <ChatWindow
          activeServer={activeServer}
          activeRoom={activeRoom}
        />

      </div>

      {/* ==================== OUTSTANDING INIVITATION PANEL ==================== */}
      {inviteCode && inviteServer && (
        <div id="invitation-overlay-card" className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-gradient-to-tr from-amber-500/20 to-slate-900 border border-amber-500/10 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-amber-500" />
            </div>

            <span className="px-2.5 py-0.5 bg-amber-500/10 font-bold border border-amber-900/30 text-amber-500 text-[10px] rounded-full mb-3">
              دعوت‌نامه غیرمنتظره
            </span>

            <h3 className="text-xl font-bold text-slate-100 mb-1">حمایت از سرور «{inviteServer.name}»</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-5 leading-normal">
              توسط دوست آنلاین شما <strong className="text-emerald-400">{inviteServer.ownerName}</strong> دعوت شده‌اید تا عضو این سرور خصوصی شده و با آنها وارد گفتگو شوید.
            </p>

            <div className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6 text-right">
              <span className="block text-[10px] text-slate-500 mb-0.5">معرفی فضای گپ:</span>
              <p className="text-xs text-slate-400 leading-normal line-clamp-2">
                {inviteServer.description || 'فضا برای تقسیم ایده‌ها و ارتباط گرم ریل‌تایم.'}
              </p>
            </div>

            <div className="w-full flex gap-3">
              <button
                id="reject-invite-btn"
                onClick={() => {
                  setInviteCode(null);
                  setInviteServer(null);
                  // Clear URL parameters cleanly
                  window.history.replaceState({}, document.title, window.location.pathname);
                }}
                className="flex-1 py-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-xl font-bold transition-all"
              >
                رد دعوت و بستن
              </button>
              <button
                id="accept-invite-btn"
                onClick={handleAcceptInvite}
                className="flex-1 py-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/15 transition-all"
              >
                پذیرش دعوت و ورود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== USER PROFILE OVERLAY MODAL ==================== */}
      {showProfileModal && (
        <UserProfile
          onClose={() => setShowProfileModal(false)}
          onUpdate={handleProfileUpdate}
        />
      )}

      {/* ==================== GLOBAL COMMUNITIES DIRECTORY OVERLAY MODAL ==================== */}
      {showDirectoryModal && (
        <ServerDirectory
          onClose={() => setShowDirectoryModal(false)}
          onJoinServer={handleDirectoryJoin}
          joinedServerIds={joinedServers.map(s => s.serverId)}
        />
      )}

    </div>
  );
}

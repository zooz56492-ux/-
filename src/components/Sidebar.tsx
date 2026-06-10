/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, getDocs, where, writeBatch } from 'firebase/firestore';
import { ServerInstance, ChatRoom, UserProfile } from '../types';
import { Hash, Plus, Trash2, LogOut, Copy, Check, Globe, Lock, Compass, Settings, Users, ArrowRight, MessageSquareCode, User } from 'lucide-react';

interface SidebarProps {
  onSelectServer: (server: ServerInstance | null) => void;
  onSelectRoom: (room: ChatRoom | null) => void;
  onOpenProfile: () => void;
  onOpenDirectory: () => void;
  activeServer: ServerInstance | null;
  activeRoom: ChatRoom | null;
  myProfile: UserProfile | null;
}

export default function Sidebar({
  onSelectServer,
  onSelectRoom,
  onOpenProfile,
  onOpenDirectory,
  activeServer,
  activeRoom,
  myProfile
}: SidebarProps) {
  const currentUser = auth.currentUser;
  
  // States
  const [joinedServers, setJoinedServers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form states
  const [newServerName, setNewServerName] = useState('');
  const [newServerDesc, setNewServerDesc] = useState('');
  const [isServerPrivate, setIsServerPrivate] = useState(false);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');

  // 1. Listen to user's joined servers (index in their profile subcollection)
  useEffect(() => {
    if (!currentUser) return;
    const joinedRef = collection(db, 'users', currentUser.uid, 'joinedServers');
    const unsubscribe = onSnapshot(joinedRef, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push(doc.data());
      });
      // Sort by joined title or date
      list.sort((a,b) => b.joinedAt?.seconds - a.joinedAt?.seconds);
      setJoinedServers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/joinedServers`);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. Fetch full server settings when a server is selected inside the UI
  // Note: Joined servers in subcollection only contain keys. We might want to subscribe to the actual Server doc itself!
  const [activeServerDetails, setActiveServerDetails] = useState<ServerInstance | null>(null);

  useEffect(() => {
    if (!activeServer) {
      setActiveServerDetails(null);
      setRooms([]);
      return;
    }

    const serverDocRef = doc(db, 'servers', activeServer.id);
    const unsubscribeServer = onSnapshot(serverDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveServerDetails({ id: docSnap.id, ...docSnap.data() } as ServerInstance);
      }
    });

    const roomsCollectionRef = collection(db, 'servers', activeServer.id, 'rooms');
    const roomsQuery = query(roomsCollectionRef);
    const unsubscribeRooms = onSnapshot(roomsQuery, (snap) => {
      const roomList: ChatRoom[] = [];
      snap.forEach((doc) => {
        roomList.push({ id: doc.id, ...doc.data() } as ChatRoom);
      });
      roomList.sort((a, b) => a.createdAt?.seconds - b.createdAt?.seconds);
      setRooms(roomList);

      // Auto select the first room if currently not selecting anything or selecting another server's room
      if (roomList.length > 0) {
        const hasCurrentActive = roomList.some(r => r.id === activeRoom?.id);
        if (!hasCurrentActive || activeRoom?.serverId !== activeServer.id) {
          onSelectRoom(roomList[0]);
        }
      } else {
        onSelectRoom(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `servers/${activeServer.id}/rooms`);
    });

    return () => {
      unsubscribeServer();
      unsubscribeRooms();
    };
  }, [activeServer]);

  // Handles Server creation
  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !myProfile || !newServerName.trim()) return;

    const serverId = doc(collection(db, 'servers')).id;
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    const serverData: Omit<ServerInstance, 'id'> = {
      name: newServerName.trim(),
      ownerId: currentUser.uid,
      ownerName: myProfile.displayName || currentUser.displayName || 'کاربر',
      ownerPhoto: myProfile.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
      description: newServerDesc.trim() || 'به این سرور چت خوش آمدید.',
      inviteCode: inviteCode,
      isPrivate: isServerPrivate,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      const batch = writeBatch(db);

      // 1. Create server doc
      const serverRef = doc(db, 'servers', serverId);
      batch.set(serverRef, serverData);

      // 2. Add creator to members list
      const memberRef = doc(db, 'servers', serverId, 'members', currentUser.uid);
      batch.set(memberRef, {
        role: 'owner',
        displayName: myProfile.displayName,
        photoURL: myProfile.photoURL,
        joinedAt: new Date()
      });

      // 3. Create default general room
      const generalRoomId = 'general';
      const roomRef = doc(db, 'servers', serverId, 'rooms', generalRoomId);
      batch.set(roomRef, {
        name: 'عمومی 📢',
        serverId: serverId,
        description: 'اتاق پیش‌فرض برای گپ و گفت عمومی اعضا',
        ownerId: currentUser.uid,
        createdAt: new Date()
      });

      // 4. Record joined server on creator's profile index
      const userJoinRef = doc(db, 'users', currentUser.uid, 'joinedServers', serverId);
      batch.set(userJoinRef, {
        serverId: serverId,
        serverName: newServerName.trim(),
        inviteCode: inviteCode,
        joinedAt: new Date()
      });

      await batch.commit();

      setNewServerName('');
      setNewServerDesc('');
      setIsServerPrivate(false);
      setShowCreateServer(false);

      // Focus parent app on the newly created server
      onSelectServer({ id: serverId, ...serverData } as ServerInstance);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `servers/${serverId}`);
    }
  };

  // Handles room creation
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeServer || !newRoomName.trim()) return;

    const roomId = doc(collection(db, 'servers', activeServer.id, 'rooms')).id;
    const roomRef = doc(db, 'servers', activeServer.id, 'rooms', roomId);

    try {
      await setDoc(roomRef, {
        name: newRoomName.trim(),
        serverId: activeServer.id,
        description: newRoomDesc.trim() || '',
        ownerId: currentUser.uid,
        createdAt: new Date()
      });

      setNewRoomName('');
      setNewRoomDesc('');
      setShowCreateRoom(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `servers/${activeServer.id}/rooms/${roomId}`);
    }
  };

  // Delete Room
  const handleDeleteRoom = async (roomToDelete: ChatRoom) => {
    if (!activeServer || !currentUser) return;
    if (activeServer.ownerId !== currentUser.uid) {
      alert('فقط صاحب سرور می‌تواند اتاق‌ها را حذف کند.');
      return;
    }
    if (roomToDelete.id === 'general') {
      alert('اتاق عمومی و اصلی سرور قابل حذف نیست.');
      return;
    }

    if (window.confirm(`آیا مطمئن هستید که می‌خواهید اتاق "${roomToDelete.name}" را برای همیشه حذف کنید؟`)) {
      try {
        await deleteDoc(doc(db, 'servers', activeServer.id, 'rooms', roomToDelete.id));
        if (activeRoom?.id === roomToDelete.id) {
          onSelectRoom(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `servers/${activeServer.id}/rooms/${roomToDelete.id}`);
      }
    }
  };

  // Delete Server entirely
  const handleDeleteServer = async () => {
    if (!activeServerDetail() || !currentUser) return;
    const detail = activeServerDetail()!;

    if (detail.ownerId !== currentUser.uid) {
      alert('فقط صاحب سرور قادر به انحلال آن است.');
      return;
    }

    const confirmName = prompt(`برای حذف سرور، لطفاً نام آن ("${detail.name}") را وارد کنید:`);
    if (confirmName === detail.name) {
      try {
        // Complete clean setup deletion
        // 1. Remove from user's index (we can let users clean their index, but let's delete creator's index first)
        await deleteDoc(doc(db, 'users', currentUser.uid, 'joinedServers', detail.id));
        // 2. Delete server doc
        await deleteDoc(doc(db, 'servers', detail.id));
        
        onSelectServer(null);
        onSelectRoom(null);
        alert('سرور با موفقیت منحل شد.');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `servers/${detail.id}`);
      }
    } else if (confirmName !== null) {
      alert('نام سرور مطابقت نداشت.');
    }
  };

  // Leave Server (for members)
  const handleLeaveServer = async () => {
    if (!activeServerDetail() || !currentUser) return;
    const detail = activeServerDetail()!;

    if (detail.ownerId === currentUser.uid) {
      alert('شما صاحب سرور هستید و نمی‌توانید آن را لغو عضویت کنید. باید آن را منحل کنید.');
      return;
    }

    if (window.confirm(`آیا می‌خواهید از سرور "${detail.name}" خارج شوید؟`)) {
      try {
        const batch = writeBatch(db);
        // Remove from members subcollection
        batch.delete(doc(db, 'servers', detail.id, 'members', currentUser.uid));
        // Remove from user index
        batch.delete(doc(db, 'users', currentUser.uid, 'joinedServers', detail.id));
        await batch.commit();

        onSelectServer(null);
        onSelectRoom(null);
      } catch (error) {
        console.error('Error leaving server:', error);
      }
    }
  };

  // Copy invitation link to clipboard
  const handleCopyInvite = () => {
    const detail = activeServerDetail();
    if (!detail) return;
    
    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${detail.inviteCode}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const activeServerDetail = () => activeServerDetails || activeServer;

  return (
    <div id="side-navigation" className="w-80 h-full bg-slate-950 border-l border-slate-900 flex flex-col items-stretch flex-shrink-0 text-right select-none select-room-sidebar rtl">
      
      {/* 1. Server Icons Left-Rail Layout Simulation or Top Header */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-900 flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-400 tracking-wider">سرورهای من</h2>
        <div className="flex gap-2">
          <button
            id="browse-public-servers"
            onClick={onOpenDirectory}
            title="کاوش سرورهای عمومی"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 rounded-lg text-slate-300 transition-all"
          >
            <Compass className="w-4.5 h-4.5" />
          </button>
          <button
            id="create-new-server-btn"
            onClick={() => setShowCreateServer(true)}
            title="ایجاد سرور جدید"
            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all"
          >
            <Plus className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* 2. Joined Servers list */}
      <div className="p-2 flex gap-2 overflow-x-auto border-b border-slate-900/50 bg-slate-950 min-h-[64px] items-center scrollbar-none">
        {joinedServers.length === 0 ? (
          <p className="text-slate-600 text-xs w-full text-center py-2">سروری نساخته‌اید یا عضو نشده‌اید.</p>
        ) : (
          joinedServers.map((srv) => {
            const isSelected = activeServer?.id === srv.serverId;
            const initials = srv.serverName ? srv.serverName.slice(0, 2) : 'سرور';
            return (
              <button
                id={`sidebar-server-tab-${srv.serverId}`}
                key={srv.serverId}
                onClick={() => onSelectServer({ id: srv.serverId, name: srv.serverName, inviteCode: srv.inviteCode } as any)}
                className={`flex-shrink-0 w-11 h-11 rounded-xl font-bold flex items-center justify-center text-xs transition-all ${
                  isSelected 
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 scale-105' 
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100'
                }`}
                title={srv.serverName}
              >
                {initials}
              </button>
            );
          })
        )}
      </div>

      {/* 3. Server details, Rooms & Channels List */}
      {activeServerDetail() ? (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
          
          {/* Active Server Info Header */}
          <div className="p-4 bg-slate-900/40 border-b border-slate-900">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-slate-100 font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                {activeServerDetail()?.isPrivate ? (
                  <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                <span>{activeServerDetail()?.name}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 overflow-hidden text-ellipsis line-clamp-1 mb-3">
              {activeServerDetail()?.description || 'بدون توضیحات اضافی'}
            </p>

            {/* Server Action Links / Invites */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-900/60 text-xs">
              <button
                id="copy-invite-link-btn"
                onClick={handleCopyInvite}
                className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-slate-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] text-emerald-400 font-bold">کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>لینک دعوت</span>
                  </>
                )}
              </button>

              {activeServerDetail()?.ownerId === currentUser?.uid ? (
                <button
                  id="delete-current-server-btn"
                  onClick={handleDeleteServer}
                  title="حذف کل سرور"
                  className="p-1.5 bg-red-950/45 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  id="leave-current-server-btn"
                  onClick={handleLeaveServer}
                  title="خروج از سرور"
                  className="p-1.5 bg-slate-900 hover:bg-red-950/30 text-amber-500 hover:text-red-400 border border-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Rooms Header */}
          <div className="px-4 py-3 bg-slate-950 flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold tracking-wider">اتاق‌های چت</span>
            {activeServerDetail()?.ownerId === currentUser?.uid && (
              <button
                id="create-new-room-btn"
                onClick={() => setShowCreateRoom(true)}
                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                title="افزودن اتاق جدید"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Active Rooms List */}
          <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-900 scrollbar-track-transparent">
            {rooms.length === 0 ? (
              <p className="text-slate-600 text-xs text-center py-4">هیچ اتاقی ساخته نشده است.</p>
            ) : (
              rooms.map((rm) => {
                const isSelected = activeRoom?.id === rm.id;
                return (
                  <div
                    id={`room-item-row-${rm.id}`}
                    key={rm.id}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 text-emerald-400 font-semibold' 
                        : 'hover:bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                    onClick={() => onSelectRoom(rm)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Hash className={`w-4.5 h-4.5 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="truncate text-sm">{rm.name}</span>
                    </div>
                    
                    {/* Delete button (accessible only for owner and not for general main room) */}
                    {activeServerDetail()?.ownerId === currentUser?.uid && rm.id !== 'general' && (
                      <button
                        id={`delete-room-${rm.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(rm);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-all"
                        title="حذف این اتاق چت"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        // Placeholder before selecting a server
        <div className="flex-1 flex flex-col justify-center items-center text-center p-6 text-slate-500 bg-slate-950">
          <MessageSquareCode className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
          <h3 className="font-bold text-slate-350 text-sm mb-1">یک سرور یا فضا انتخاب کنید</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">
            برای شروع گفتگو، یکی از سرورهای خود را در بالای نوار کناری برگزینید یا یک سرور جدید بسازید.
          </p>
        </div>
      )}

      {/* 4. User Footer Profile Bar */}
      {myProfile && (
        <div className="p-4 bg-slate-900 border-t border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <img referrerPolicy="no-referrer" src={myProfile.photoURL} alt={myProfile.displayName} className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></div>
            </div>
            
            <div className="text-right min-w-0">
              <h4 className="text-xs font-bold text-slate-100 truncate">{myProfile.displayName}</h4>
              <p className="text-[10px] text-emerald-450 font-medium font-mono truncate max-w-[120px] text-emerald-500">آنلاین</p>
            </div>
          </div>

          <button
            id="open-profile-settings"
            onClick={onOpenProfile}
            title="تنظیمات پروفایل"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>
      )}

      {/* ==================== CREATE SERVER MODAL ==================== */}
      {showCreateServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-100 mb-1">ایجاد سرور جدید</h3>
            <p className="text-xs text-slate-400 mb-4">یک فضای منحصربه‌فرد برای تقسیم گفتگوها ایجاد کنید.</p>
            
            <form onSubmit={handleCreateServer} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1.5">نام سرور</label>
                <input
                  id="new-server-name"
                  type="text"
                  maxLength={40}
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="سرور دوستان صمیمی، گیلد تفریحی و..."
                  className="w-full text-right px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-150 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1.5">توضیحات کوتاه</label>
                <textarea
                  id="new-server-desc"
                  maxLength={150}
                  value={newServerDesc}
                  onChange={(e) => setNewServerDesc(e.target.value)}
                  placeholder="هدف و موضوع گپ‌های این سرور"
                  className="w-full text-right px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-150 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-sm h-16 resize-none"
                />
              </div>

              {/* Private Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <div className="text-right">
                  <span className="block text-slate-200 text-xs font-bold mb-0.5">سرور خصوصی باشد؟</span>
                  <p className="text-[10px] text-slate-500">فقط افرادی با لینک دعوت اختصاصی عضو شوند.</p>
                </div>
                <input
                  id="server-privacy-check"
                  type="checkbox"
                  checked={isServerPrivate}
                  onChange={(e) => setIsServerPrivate(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-slate-800 focus:ring-emerald-500 rounded bg-slate-950"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800/80">
                <button
                  id="cancel-create-server"
                  type="button"
                  onClick={() => setShowCreateServer(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  id="confirm-create-server"
                  type="submit"
                  disabled={!newServerName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/15"
                >
                  ایجاد سرور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CREATE ROOM MODAL ==================== */}
      {showCreateRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-100 mb-1">ایجاد اتاق جدید</h3>
            <p className="text-xs text-slate-400 mb-4">یک اتاق چت موضوعی جدید داخل این سرور بسازید.</p>
            
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1.5">نام اتاق (مثال: موسیقی 🎵)</label>
                <input
                  id="new-room-name"
                  type="text"
                  maxLength={30}
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="ورزش، تکنولوژی، خاطرات و..."
                  className="w-full text-right px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-150 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1.5">توضیح موضوع</label>
                <input
                  id="new-room-desc"
                  type="text"
                  maxLength={100}
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  placeholder="توضیح مختصری درباره این کانال..."
                  className="w-full text-right px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-150 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800/80">
                <button
                  id="cancel-create-room"
                  type="button"
                  onClick={() => setShowCreateRoom(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  id="confirm-create-room"
                  type="submit"
                  disabled={!newRoomName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                >
                  ساخت اتاق چت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

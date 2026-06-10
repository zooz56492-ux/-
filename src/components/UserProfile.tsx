/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile as UserProfileType } from '../types';
import { User, Sparkles, Smile, ShieldCheck, Check, Save, X } from 'lucide-react';

interface UserProfileProps {
  onClose: () => void;
  onUpdate: (profile: UserProfileType) => void;
}

const AVATAR_SEEDS = [
  'Nala', 'Socks', 'Fluffy', 'Whiskers', 'Oliver', 'Milo', 'Luna', 'Bella',
  'Charlie', 'Simba', 'Jack', 'Loki', 'Toby', 'Rocky', 'Zoe', 'Chloe'
];

export default function UserProfile({ onClose, onUpdate }: UserProfileProps) {
  const currentUser = auth.currentUser;
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      if (!currentUser) return;
      const userRef = doc(db, 'users', currentUser.uid);
      try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfileType;
          setProfile(data);
          setDisplayName(data.displayName || '');
          setBio(data.bio || '');
          setPhotoURL(data.photoURL || '');
        } else {
          // Fallback if document doesn't exist yet
          const initialProfile: UserProfileType = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'کاربر جدید',
            photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
            email: currentUser.email || '',
            bio: 'سلام! من به هم‌گپ پیوستم.',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          setProfile(initialProfile);
          setDisplayName(initialProfile.displayName);
          setBio(initialProfile.bio);
          setPhotoURL(initialProfile.photoURL);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [currentUser]);

  const selectAvatar = (seed: string) => {
    setPhotoURL(`https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!displayName.trim()) return;

    setSaving(true);
    setSuccess(false);

    const userRef = doc(db, 'users', currentUser.uid);
    const updatedProfile = {
      displayName: displayName.trim(),
      photoURL: photoURL,
      bio: bio.trim(),
      email: currentUser.email || '',
      createdAt: profile?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    try {
      await setDoc(userRef, updatedProfile, { merge: true });
      onUpdate({ uid: currentUser.uid, ...updatedProfile } as UserProfileType);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div id="loading" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-300">در حال دریافت اطلاعات پروفایل...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="user-profile-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 rtl">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-500" />
            <span className="font-bold text-slate-100 text-lg">ویرایش پروفایل من</span>
          </div>
          <button id="close-profile" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-6">
          
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full border-4 border-slate-800 overflow-hidden bg-slate-950 flex items-center justify-center shadow-lg">
                <img referrerPolicy="no-referrer" src={photoURL} alt="Profile Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full transition-opacity cursor-pointer">
                <span className="text-xs text-slate-200">کارت عالیه!</span>
              </div>
            </div>

            <div className="w-full">
              <label className="block text-slate-400 text-xs text-right mb-2 font-semibold">بذر آواتار فانتزی مورد علاقه خود را انتخاب کنید:</label>
              <div className="flex items-center gap-2 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {AVATAR_SEEDS.map((seed) => {
                  const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
                  const isSelected = photoURL === avatarUrl;
                  return (
                    <button
                      id={`avatar-seed-${seed}`}
                      type="button"
                      key={seed}
                      onClick={() => selectAvatar(seed)}
                      className={`flex-shrink-0 w-11 h-11 rounded-full border-2 overflow-hidden bg-slate-950 transition-all ${
                        isSelected ? 'border-emerald-500 scale-110 shadow-lg shadow-emerald-500/20' : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <img referrerPolicy="no-referrer" src={avatarUrl} alt={seed} className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-semibold text-right mb-1.5">نام نمایشی (لقب)</label>
              <input
                id="profile-displayName-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full text-right px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="مثال: رضا آریا"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-semibold text-right mb-1.5">بیوگرافی (درباره من)</label>
              <textarea
                id="profile-bio-input"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full text-right px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors h-24 resize-none"
                placeholder="کمی درباره خودتان بنویسید..."
              />
            </div>
            
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-left">{currentUser?.email}</span>
              <div className="flex items-center gap-1.5 text-slate-300 text-right">
                <span>حساب متصل شده با گوگل</span>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              id="cancel-profile-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded-xl transition-colors font-semibold"
            >
              انصراف
            </button>
            <button
              id="save-profile-btn"
              type="submit"
              disabled={saving || !displayName.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 transition-all font-semibold"
            >
              {success ? (
                <>
                  <Check className="w-4 h-4 animate-bounce" />
                  <span>ذخیره شد!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

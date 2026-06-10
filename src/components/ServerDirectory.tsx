/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { ServerInstance } from '../types';
import { Compass, Search, Globe, Plus, Smile, Users, Heart, ArrowLeft, Check, Sparkles, X } from 'lucide-react';

interface ServerDirectoryProps {
  onClose: () => void;
  onJoinServer: (server: ServerInstance) => void;
  joinedServerIds: string[];
}

export default function ServerDirectory({ onClose, onJoinServer, joinedServerIds }: ServerDirectoryProps) {
  const currentUser = auth.currentUser;
  
  const [publicServers, setPublicServers] = useState<ServerInstance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Load public servers
  useEffect(() => {
    async function loadServers() {
      const serversRef = collection(db, 'servers');
      // Look up where they are public (isPrivate == false)
      const q = query(serversRef, where('isPrivate', '==', false));
      try {
        const snap = await getDocs(q);
        const list: ServerInstance[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as ServerInstance);
        });
        setPublicServers(list);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'servers');
      } finally {
        setLoading(false);
      }
    }
    loadServers();
  }, []);

  const handleJoin = async (server: ServerInstance) => {
    if (!currentUser) return;
    setJoiningId(server.id);

    try {
      const batch = writeBatch(db);

      // 1. Add membership to the server's public member subcollection
      const memberRef = doc(db, 'servers', server.id, 'members', currentUser.uid);
      batch.set(memberRef, {
        role: 'member',
        displayName: currentUser.displayName || 'کاربر هم‌گپ',
        photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        joinedAt: new Date()
      });

      // 2. Index in user's joined servers list (to populate their sidebar)
      const joinedRef = doc(db, 'users', currentUser.uid, 'joinedServers', server.id);
      batch.set(joinedRef, {
        serverId: server.id,
        serverName: server.name,
        inviteCode: server.inviteCode,
        joinedAt: new Date()
      });

      await batch.commit();
      
      // Feed up to parent application to open
      onJoinServer(server);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `servers/${server.id}/members/${currentUser.uid}`);
    } finally {
      setJoiningId(null);
    }
  };

  const filteredServers = publicServers.filter(srv => 
    srv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    srv.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="public-directory-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 rtl">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Compass className="w-6 h-6 text-emerald-500" />
            <div>
              <h3 className="font-bold text-slate-100 text-lg">کاوش تالارهای گفتگوی عمومی</h3>
              <p className="text-xs text-slate-400">یک سرور عمومی را انتخاب کنید تا با بقیه ایرانیان و دوستان آنلاین گپ بزنید.</p>
            </div>
          </div>
          <button id="close-directory" onClick={onClose} className="p-1 px-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-900 flex gap-2">
          <div className="flex-1 flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 focus-within:border-emerald-600 transition-colors">
            <Search className="w-4.5 h-4.5 text-slate-500" />
            <input
              id="search-directory-query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو بر اساس نام فروم، برچسب‌ها یا اهداف..."
              className="w-full text-right bg-transparent px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Directory List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="text-center py-20">
              <div className="h-8 w-8 animate-spin border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3"></div>
              <p className="text-slate-400 text-sm">در حال بارگزاری تالارها...</p>
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Globe className="w-14 h-14 text-slate-705 mx-auto mb-3 text-slate-800 animate-pulse" />
              <h4 className="font-bold text-slate-400 mb-1">هیچ سرور عمومی پیدا نشد</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {searchQuery ? 'هیچ فضایی با معیارهای جستجو مطابقت نداشت.' : 'اولین تالار عمومی را با ساخت سرور جدید بالا بیارید! 📢'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredServers.map((server) => {
                const isJoined = joinedServerIds.includes(server.id);
                return (
                  <div
                    id={`directory-card-${server.id}`}
                    key={server.id}
                    className="p-4 bg-slate-950/45 border border-slate-850 hover:border-slate-800 rounded-xl flex flex-col justify-between space-y-3 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-105 text-sm">{server.name}</span>
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded-full font-bold">
                          <Globe className="w-3 h-3" />
                          <span>عمومی</span>
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 min-h-[32px]">
                        {server.description || 'مکانی جالب برای همنشینی و ارتباط کلامی.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-900/60 flex items-center justify-between">
                      {/* Owner Info */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <img
                          referrerPolicy="no-referrer"
                          src={server.ownerPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${server.ownerId}`}
                          alt={server.ownerName}
                          className="w-5 h-5 rounded-full object-cover bg-slate-900"
                        />
                        <span className="text-[10px] text-slate-550 truncate max-w-[80px]" title={server.ownerName}>
                          صاحب: {server.ownerName}
                        </span>
                      </div>

                      {/* Action Button */}
                      {isJoined ? (
                        <div className="px-3 py-1.5 bg-slate-900/50 text-emerald-400 text-xs font-bold rounded-lg flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>عضو هستید</span>
                        </div>
                      ) : (
                        <button
                          id={`join-server-action-${server.id}`}
                          onClick={() => handleJoin(server)}
                          disabled={joiningId !== null}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1"
                        >
                          <span>{joiningId === server.id ? 'در حال ورود...' : 'عضویت و فرود'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

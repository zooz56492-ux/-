/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ServerInstance, ChatRoom, ChatMessage, ServerMember } from '../types';
import { Send, Trash2, Users, Hash, ShieldCheck, MessageSquare, Info, Star, Calendar } from 'lucide-react';

interface ChatWindowProps {
  activeServer: ServerInstance | null;
  activeRoom: ChatRoom | null;
}

export default function ChatWindow({ activeServer, activeRoom }: ChatWindowProps) {
  const currentUser = auth.currentUser;
  
  // Real-time feeds state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [inputText, setInputText] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Auto Scroll to Bottom on newer messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 2. Real-time message listener
  useEffect(() => {
    if (!activeServer || !activeRoom) {
      setMessages([]);
      return;
    }

    const messagesPath = `servers/${activeServer.id}/rooms/${activeRoom.id}/messages`;
    const msgCollection = collection(db, messagesPath);
    const msgQuery = query(msgCollection, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(msgQuery, (snap) => {
      const list: ChatMessage[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, messagesPath);
    });

    return () => unsubscribe();
  }, [activeServer, activeRoom]);

  // 3. Real-time active members list of the server
  useEffect(() => {
    if (!activeServer) {
      setMembers([]);
      return;
    }

    const membersPath = `servers/${activeServer.id}/members`;
    const membersCollectionRef = collection(db, membersPath);
    
    const unsubscribe = onSnapshot(membersCollectionRef, (snap) => {
      const list: ServerMember[] = [];
      snap.forEach((doc) => {
        list.push({ userId: doc.id, ...doc.data() } as ServerMember);
      });
      // Bring owner to the top
      list.sort((a, b) => {
        if (a.role === 'owner') return -1;
        if (b.role === 'owner') return 1;
        return 0;
      });
      setMembers(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, membersPath);
    });

    return () => unsubscribe();
  }, [activeServer]);

  // 4. Send new message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeServer || !activeRoom || !inputText.trim() || sending) return;

    setSending(true);
    const messageContent = inputText.trim();
    setInputText(''); // Quick optimising reset

    const messagesPath = `servers/${activeServer.id}/rooms/${activeRoom.id}/messages`;
    const msgCollectionRef = collection(db, messagesPath);

    try {
      await addDoc(msgCollectionRef, {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'کاربر هم‌گپ',
        senderPhoto: currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        content: messageContent,
        createdAt: new Date()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, messagesPath);
    } finally {
      setSending(false);
    }
  };

  // 5. Delete Message
  const handleDeleteMessage = async (msgId: string) => {
    if (!activeServer || !activeRoom) return;

    if (window.confirm('آیا مطمئن هستید که می‌خواهید این پیام را حذف کنید؟')) {
      const messageDocPath = `servers/${activeServer.id}/rooms/${activeRoom.id}/messages/${msgId}`;
      try {
        await deleteDoc(doc(db, messageDocPath));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, messageDocPath);
      }
    }
  };

  // Check if current user is owner of the server
  const isServerOwner = activeServer?.ownerId === currentUser?.uid;

  return (
    <div id="chat-workspace" className="flex-1 h-full flex items-stretch bg-slate-900 text-slate-100 min-w-0 rtl select-none">
      
      {/* Messages Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full justify-between bg-slate-900 border-l border-slate-900/60">
        
        {/* Chat Room Top Navigation Bar */}
        {activeRoom ? (
          <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-emerald-400" />
              <div className="text-right">
                <h3 className="font-bold text-slate-100 text-sm">{activeRoom.name}</h3>
                <p className="text-[11px] text-slate-400 font-normal">{activeRoom.description || 'مکالمه زنده ریل‌تایم اعضای سرور'}</p>
              </div>
            </div>

            <button
              id="toggle-sidebar-members"
              onClick={() => setShowMembers(!showMembers)}
              className={`p-2 rounded-lg flex items-center gap-1.5 transition-colors ${
                showMembers ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-150 hover:bg-slate-850'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="text-xs font-semibold">{members.length} عضو</span>
            </button>
          </div>
        ) : (
          <div className="h-14 bg-slate-950/80 border-b border-slate-900"></div>
        )}

        {/* Messages Feed */}
        {activeRoom ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 text-slate-500">
                <MessageSquare className="w-16 h-16 text-slate-800 mb-2 animate-bounce" />
                <h4 className="font-bold text-slate-400 mb-1">یک مکالمه جدید را آغاز کنید!</h4>
                <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                  هنوز هیچ پیامی در این کانال فرستاده نشده است. اولین نفری باشید که سلام می‌کند! 👋
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.senderId === currentUser?.uid;
                const canDelete = isMine || isServerOwner;
                
                return (
                  <div id={`chat-msg-row-${msg.id}`} key={msg.id} className={`flex items-start gap-3 group ${isMine ? 'flex-row-reverse' : ''}`}>
                    {/* Sender Avatar */}
                    <img
                      referrerPolicy="no-referrer"
                      src={msg.senderPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${msg.senderId}`}
                      alt={msg.senderName}
                      className="w-10 h-10 rounded-full border border-slate-800 flex-shrink-0 object-cover bg-slate-950 mt-0.5"
                    />

                    {/* Message Details */}
                    <div className={`flex flex-col max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-300">{msg.senderName}</span>
                        <span className="text-[10px] text-slate-500">
                          {msg.createdAt?.seconds 
                            ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
                            : 'هم‌اکنون'}
                        </span>
                      </div>

                      {/* Chat Bubble */}
                      <div className="relative">
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-md break-words ${
                          isMine 
                            ? 'bg-emerald-600 text-white rounded-tr-none' 
                            : 'bg-slate-950/60 text-slate-200 border border-slate-900 rounded-tl-none'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>

                        {/* Action buttons on Hover */}
                        {canDelete && (
                          <button
                            id={`delete-msg-btn-${msg.id}`}
                            onClick={() => handleDeleteMessage(msg.id)}
                            className={`absolute top-1/2 -translate-y-1/2 p-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg ${
                              isMine ? '-left-11' : '-right-11'
                            }`}
                            title="حذف این پیام"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Target anchor for auto scrolling */}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex-grow flex flex-col justify-center items-center text-center p-8 bg-slate-900">
            <MessageSquare className="w-16 h-16 text-slate-800 mb-3" />
            <h3 className="font-bold text-slate-250 text-base mb-1">به پلتفرم گپ آنلاین خوش آمدید</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-md">
              یکی از سرورهای خود را از بالا انتخاب کنید، سپس وارد یک اتاق چت شده و مکالمه ریل‌تایم را با دوستانتان آغاز نمایید. یا یک سرور چت جدید بسازید!
            </p>
          </div>
        )}

        {/* Input box */}
        {activeRoom && (
          <div className="p-4 bg-slate-950/50 border-t border-slate-900">
            <form onSubmit={handleSendMessage} className="flex gap-2 items-center bg-slate-950 border border-slate-850 rounded-xl p-1 focus-within:border-emerald-600 transition-colors">
              <input
                id="message-text-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`سلام کنید و پیامی به #${activeRoom.name} بفرستید...`}
                className="flex-1 text-right bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                disabled={sending}
                maxLength={2000}
                required
              />
              <button
                id="submit-message-btn"
                type="submit"
                disabled={!inputText.trim() || sending}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl shadow-md transition-all flex items-center justify-center flex-shrink-0"
              >
                <Send className="w-4 h-4 transform rotate-180" />
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Online/Offline Server Members sidebar block */}
      {activeServer && showMembers && (
        <div id="members-list-bar" className="w-64 bg-slate-950 border-r border-slate-900/60 p-4 flex flex-col overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-4 text-slate-400">
            <Users className="w-4 h-4 text-emerald-450" />
            <h4 className="text-xs font-bold uppercase tracking-wider">لیست اعضای سرور ({members.length})</h4>
          </div>

          <div className="space-y-3">
            {members.map((mbr) => {
              const isOwner = mbr.role === 'owner';
              return (
                <div id={`member-item-${mbr.userId}`} key={mbr.userId} className="flex items-center justify-between p-1.5 hover:bg-slate-900/50 rounded-lg transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative">
                      <img
                        referrerPolicy="no-referrer"
                        src={mbr.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${mbr.userId}`}
                        alt={mbr.displayName}
                        className="w-7 h-7 rounded-full border border-slate-800 object-cover bg-slate-900"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-slate-950"></span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px]">{mbr.displayName}</span>
                  </div>

                  {isOwner && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 text-amber-400 border border-amber-900/40 text-[9px] rounded-md font-bold">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      <span>صاحب سرور</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Guidelines info */}
          <div className="mt-8 pt-4 border-t border-slate-900 text-[10px] text-slate-500 leading-normal space-y-2">
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-600" />
              <span>این سرور توسط صاحب آن مدیریت می‌شود. شما می‌توانید با کپی کردن لینک دعوت از پانل چپ صمیمی‌ترین دوستانتان را اضافه کنید.</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

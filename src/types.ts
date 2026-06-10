/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  bio: string;
  createdAt: any; // Firestore Timestamp style
  updatedAt: any;
}

export interface ServerInstance {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string;
  description: string;
  inviteCode: string;
  isPrivate: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ServerMember {
  userId: string;
  role: 'owner' | 'member';
  displayName: string;
  photoURL: string;
  joinedAt: any;
}

export interface ChatRoom {
  id: string;
  name: string;
  serverId: string;
  description: string;
  ownerId: string;
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  content: string;
  createdAt: any;
}

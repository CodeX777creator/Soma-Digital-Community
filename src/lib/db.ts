import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  query, 
  orderBy, 
  getDocs, 
  updateDoc, 
  serverTimestamp,
  onSnapshot,
  increment,
  runTransaction,
  getCountFromServer,
  limit as firestoreLimit,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Community Feed Types ─────────────────────────────────────────────────────

export type ReactionType = 'like' | 'love' | 'funny' | 'wow' | 'sad' | 'fire';

export interface PostReaction {
  type: ReactionType;
  userId: string;
  createdAt: any;
}

export type PostType = 'win' | 'insight' | 'mentorship' | 'announcement' | 'question';

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorTier: 'explorer' | 'pro' | 'elite';
  authorRole: string;
  isFounder?: boolean;
  content: string;
  channel?: string;
  tags: string[];
  type: PostType;
  isPinned: boolean;
  likeCount: number;
  commentCount: number;
  imageUrl?: string;
  linkUrl?: string;
  topReaction?: ReactionType;
  reactionCounts?: Partial<Record<ReactionType, number>>;
  createdAt: any;
  // Edit/Delete tracking
  isEdited?: boolean;
  editedAt?: any;
  deleted?: boolean;
  deletedAt?: any;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorTier: 'explorer' | 'pro' | 'elite';
  content: string;
  parentId?: string | null; // For reply threading
  replyCount?: number;
  createdAt: any;
}

// ─── Post Service ─────────────────────────────────────────────────────────────

export const postService = {
  // Create a new post
  async createPost(
    userId: string,
    userData: { name: string; photoURL?: string; tier: string; selectedIdentity?: string },
    content: string,
    tags: string[],
    type: PostType = 'insight',
    channel = 'general',
    imageUrl?: string,
    linkUrl?: string
  ): Promise<string> {
    if (!db) throw new Error('Database not initialized');
    const postsRef = collection(db, 'posts');
    const docRef = await addDoc(postsRef, {
      authorId: userId,
      authorName: userData.name || 'Anonymous',
      authorAvatar: userData.photoURL || null,
      authorTier: userData.tier || 'explorer',
      authorRole: userData.selectedIdentity || 'Entrepreneur',
      isFounder: false,
      content,
      channel,
      tags,
      type,
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      reactionCounts: {},
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  // Subscribe to real-time feed updates
  subscribeToPosts(
    callback: (posts: Post[]) => void,
    postLimit = 30
  ): () => void {
    if (!db) throw new Error('Database not initialized');
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), firestoreLimit(postLimit));
    return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      // Sort: pinned first, then by time
      posts.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });
      callback(posts);
    });
  },

  async getPost(postId: string): Promise<Post | null> {
    if (!db) throw new Error('Database not initialized');
    const postRef = doc(db, 'posts', postId);
    const snap = await getDoc(postRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Post;
  },

  // Get the current user's reaction on a post (null = no reaction)
  async getUserReaction(postId: string, userId: string): Promise<ReactionType | null> {
    if (!db) throw new Error('Database not initialized');
    const reactionRef = doc(db, 'likes', `${postId}_${userId}`);
    const snap = await getDoc(reactionRef);
    if (snap.exists()) return (snap.data() as PostReaction).type;
    return null;
  },

  // Subscribe to the current user's reaction for a given post
  subscribeToUserReaction(
    postId: string,
    userId: string,
    callback: (reaction: ReactionType | null) => void
  ): () => void {
    if (!db) throw new Error('Database not initialized');
    const reactionRef = doc(db, 'likes', `${postId}_${userId}`);
    return onSnapshot(reactionRef, snap => {
      callback(snap.exists() ? (snap.data() as PostReaction).type : null);
    });
  },

  // Toggle / change reaction — Firestore is the eventual source of truth
  async setReaction(postId: string, userId: string, newReaction: ReactionType | null): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    const reactionId = `${postId}_${userId}`;
    const reactionRef = doc(db, 'likes', reactionId);
    const postRef = doc(db, 'posts', postId);

    console.log('[setReaction] Starting transaction:', { postId, userId, newReaction, reactionId });

    try {
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(reactionRef);
        const existingType: ReactionType | null = existing.exists()
          ? (existing.data() as PostReaction).type
          : null;

        console.log('[setReaction] Existing reaction:', existingType);

        if (existingType === newReaction || newReaction === null) {
          // Remove reaction
          if (existing.exists()) {
            console.log('[setReaction] Removing reaction');
            tx.delete(reactionRef);
            tx.update(postRef, {
              likeCount: increment(-1),
              [`reactionCounts.${existingType}`]: increment(-1),
            });
          }
        } else {
          // Add or swap reaction
          console.log('[setReaction] Setting new reaction:', newReaction);
          tx.set(reactionRef, { type: newReaction, userId, createdAt: serverTimestamp() });
          if (existingType) {
            // Swap: decrement old, increment new
            tx.update(postRef, {
              [`reactionCounts.${existingType}`]: increment(-1),
              [`reactionCounts.${newReaction}`]: increment(1),
            });
          } else {
            // New reaction
            tx.update(postRef, {
              likeCount: increment(1),
              [`reactionCounts.${newReaction}`]: increment(1),
            });
          }
        }
    });
      console.log('[setReaction] Transaction successful');
    } catch (error) {
      console.error('[setReaction] Transaction failed:', error);
      throw error;
    }
  },

  // Add a comment
  async addComment(
    postId: string,
    userId: string,
    userData: { name: string; photoURL?: string; tier: string },
    content: string,
    parentId?: string | null
  ): Promise<string> {
    if (!db) throw new Error('Database not initialized');
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const docRef = await addDoc(commentsRef, {
      postId,
      authorId: userId,
      authorName: userData.name || 'Anonymous',
      authorAvatar: userData.photoURL || null,
      authorTier: userData.tier || 'explorer',
      content,
      parentId: parentId || null,
      replyCount: 0,
      createdAt: serverTimestamp(),
    });
    
    // Increment comment count on post
    await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
    
    // If this is a reply, increment parent's replyCount
    if (parentId) {
      await updateDoc(doc(db, 'posts', postId, 'comments', parentId), { 
        replyCount: increment(1) 
      });
    }
    
    return docRef.id;
  },

  // Add a reply to a comment
  async addReply(
    postId: string,
    parentCommentId: string,
    userId: string,
    userData: { name: string; photoURL?: string; tier: string },
    content: string
  ): Promise<string> {
    return this.addComment(postId, userId, userData, content, parentCommentId);
  },

  // Get replies for a specific comment
  subscribeToReplies(
    postId: string,
    parentId: string,
    callback: (comments: Comment[]) => void
  ): () => void {
    if (!db) throw new Error('Database not initialized');
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(
      commentsRef, 
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      const allComments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
      // Filter replies for this parent
      const replies = allComments.filter(c => c.parentId === parentId);
      callback(replies);
    });
  },

  // Subscribe to comments on a post
  subscribeToComments(
    postId: string,
    callback: (comments: Comment[]) => void
  ): () => void {
    if (!db) throw new Error('Database not initialized');
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    });
  },

  // Pin / unpin a post (admin)
  async pinPost(postId: string, pinned: boolean): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    await updateDoc(doc(db, 'posts', postId), { isPinned: pinned });
  },

  // Update a post (author only)
  async updatePost(postId: string, updates: Partial<Post>): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    await updateDoc(doc(db, 'posts', postId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  // Delete a post (author or admin)
  async deletePost(postId: string): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    await updateDoc(doc(db, 'posts', postId), { 
      deleted: true,
      content: '[deleted]',
      deletedAt: serverTimestamp(),
    });
  },

  // Update mission progress
  async completeMission(userId: string, missionId: string): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      [`missions.${missionId}`]: true,
      [`missions.completedAt.${missionId}`]: serverTimestamp(),
    });
  },

  // Track user stats
  async incrementUserStat(userId: string, stat: 'postCount' | 'commentCount' | 'likeCount'): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      [stat]: increment(1),
    });
  },
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: any;
  type?: 'text' | 'roadmap' | 'advice' | 'content';
  data?: any;
}

export interface ChatThread {
  id: string;
  title: string;
  lastUpdated: any;
  pinned: boolean;
  userId: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  tier: 'explorer' | 'pro' | 'elite';
  onboardingComplete: boolean;
  selectedIdentity: string;
  experienceLevel: string;
  financialGoal: string;
  xp: number;
  roadmapGenerated: boolean;
  createdAt: any;
  updatedAt: any;
  intendedPlan?: 'explorer' | 'pro' | 'elite';
  ownsLegacyBuilders?: boolean;
  engagementScore?: number;
  growthAssessmentResult?: {
    ownsLegacyBuilders: boolean;
    readinessLevel: 'low' | 'medium' | 'high';
    businessStage: 'beginner' | 'growing' | 'advanced';
    interestAlignment: number;
    recommendedPath: string;
  } | null;
  growthAssessmentDismissed?: boolean;
  subscription?: {
    provider: string;
    status: string;
    plan: 'explorer' | 'pro' | 'elite';
    transactionId?: string;
    startedAt?: any;
    expiresAt?: any;
  };
  [key: string]: any; // Allow additional flexible fields like budget/availableTime
}

export const dbService = {
  // User Profile and Goals
  async saveUserProfile(userId: string, data: Partial<UserProfile>) {
    if (!db) throw new Error('Database not initialized');
    const userRef = doc(db, "users", userId);

    // Safety check: Strip client-controlled entitlement fields to prevent overrides
    const {
      tier,
      subscription,
      isAdmin,
      roles,
      plan,
      ...safeData
    } = data as any;

    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const defaultProfile = {
        uid: userId,
        tier: 'explorer',
        subscription: {
          provider: 'free',
          status: 'active',
          plan: 'explorer'
        },
        onboardingComplete: false,
        xp: 0,
        roadmapGenerated: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...safeData
      };
      await setDoc(userRef, defaultProfile);
    } else {
      await setDoc(userRef, {
        ...safeData,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  },

  async updateUserProfile(userId: string, data: Partial<UserProfile>) {
    return this.saveUserProfile(userId, data);
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    if (!db) throw new Error('Database not initialized');
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    return snap.exists() ? snap.data() as UserProfile : null;
  },

  // Roadmap persistence
  async saveRoadmap(userId: string, roadmap: any) {
    if (!db) throw new Error('Database not initialized');
    const roadmapRef = doc(db, `users/${userId}/roadmaps`, "current");
    await setDoc(roadmapRef, {
      ...roadmap,
      createdAt: serverTimestamp()
    });
  },

  // Chat Threads
  async createThread(userId: string, title: string) {
    if (!db) throw new Error('Database not initialized');
    const threadsRef = collection(db, `users/${userId}/mentorHistory`);
    const docRef = await addDoc(threadsRef, {
      title,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      pinned: false,
      userId
    });
    return docRef.id;
  },

  async getThreads(userId: string) {
    if (!db) throw new Error('Database not initialized');
    const threadsRef = collection(db, `users/${userId}/mentorHistory`);
    const q = query(threadsRef, orderBy("lastUpdated", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatThread));
  },

  async updateThread(userId: string, threadId: string, data: Partial<ChatThread>) {
    if (!db) throw new Error('Database not initialized');
    const threadRef = doc(db, `users/${userId}/mentorHistory`, threadId);
    await updateDoc(threadRef, {
      ...data,
      lastUpdated: serverTimestamp()
    });
  },

  // Messages
  async saveMessage(userId: string, threadId: string, message: Omit<ChatMessage, 'timestamp'>) {
    if (!db) throw new Error('Database not initialized');
    const messagesRef = collection(db, `users/${userId}/mentorHistory/${threadId}/messages`);
    await addDoc(messagesRef, {
      ...message,
      timestamp: serverTimestamp()
    });
    
    // Update thread lastUpdated
    const threadRef = doc(db, `users/${userId}/mentorHistory`, threadId);
    await updateDoc(threadRef, { lastUpdated: serverTimestamp() });
  },

  async getMessages(userId: string, threadId: string) {
    if (!db) throw new Error('Database not initialized');
    const messagesRef = collection(db, `users/${userId}/mentorHistory/${threadId}/messages`);
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as ChatMessage);
  },

  // Global Community Stats
  async getGlobalStats() {
    if (!db) throw new Error('Database not initialized');
    try {
      const usersRef = collection(db, 'users');
      const postsRef = collection(db, 'posts');
      
      const [usersCount, postsCount] = await Promise.all([
        getCountFromServer(usersRef),
        getCountFromServer(postsRef)
      ]);

      return {
        memberCount: usersCount.data().count,
        discussionCount: postsCount.data().count,
        revenueGenerated: 0 
      };
    } catch (error) {
      console.error("Error fetching global stats:", error);
      return { memberCount: 0, discussionCount: 0, revenueGenerated: 0 };
    }
  },

  async getRecentActivity(limitCount = 4) {
    if (!db) throw new Error('Database not initialized');
    try {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        type: 'post',
        user: doc.data().authorName,
        time: doc.data().createdAt,
        detail: `Shared a new ${doc.data().type}`
      }));
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      return [];
    }
  },

  async getRecentMembers(limitCount = 4) {
    if (!db) throw new Error('Database not initialized');
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        type: 'join',
        user: doc.data().name || 'Anonymous',
        time: doc.data().createdAt,
        detail: 'Joined the Founding cohort'
      }));
    } catch (error) {
      console.error("Error fetching recent members:", error);
      return [];
    }
  }
};

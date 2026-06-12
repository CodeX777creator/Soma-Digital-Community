import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  where,
  serverTimestamp,
  doc,
  runTransaction,
  increment,
  onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/providers/AuthProvider';
import { authFetch } from '@/lib/clientApi';
import { seedMissionsIfMissing } from '@/lib/missions';
import { calculateWeeklyXP, logXPEvent } from '@/lib/xp';
import { createNotification } from '@/lib/notifications';

// Types
export interface DashboardLeaderboardEntry {
  id: string;
  uid: string;
  name: string;
  avatar?: string;
  xp: number;
  tier: 'explorer' | 'pro' | 'elite';
  rank: number;
}

export interface PerformanceDataPoint {
  name: string;
  xp: number;
  date: string;
}

export interface DailyMission {
  id: string;
  title: string;
  xp: number;
  completed: boolean;
  lockedForTier: 'explorer' | 'pro' | 'elite' | null;
  dateString: string;
  completedAt?: any;
  createdAt: any;
}

export interface UserStats {
  currentXP: number;
  level: number;
  streak: number;
  tier: 'explorer' | 'pro' | 'elite';
  goal: string | null;
}

// Hook for leaderboard data
export function useDashboardLeaderboard(limit = 10) {
  const [leaders, setLeaders] = useState<DashboardLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

        const fetchLeaderboard = async () => {
      if (!db) return;
      try {
        setLoading(true);
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef,
          orderBy('xp', 'desc'),
          firestoreLimit(limit)
        );

        const snapshot = await getDocs(q);
        const leaderboardData = snapshot.docs.map((doc, index) => ({
          id: doc.id,
          uid: doc.id,
          name: doc.data().name || 'Anonymous',
          avatar: doc.data().photoURL,
          xp: doc.data().xp || 0,
          tier: doc.data().tier || 'explorer',
          rank: index + 1,
        }));

        setLeaders(leaderboardData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [limit]);

  return { leaders, loading, error };
}

// Hook for user's weekly performance data
export function useWeeklyPerformance() {
  const { user } = useAuth();
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchPerformance = async () => {
      try {
        setLoading(true);
        const data = await calculateWeeklyXP(user.uid);
        setPerformanceData(data);
        setError(null);
      } catch (error) {
        console.error('Failed to fetch performance data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch performance');
      } finally {
        setLoading(false);
      }
    };

    fetchPerformance();
  }, [user?.uid]);

  return { performanceData, loading, error };
}

// Hook for daily missions
export function useDailyMissions() {
  const { user } = useAuth();
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    useEffect(() => {
    if (!user?.uid || !db) return;

        const fetchMissions = async () => {
      if (!db) return;
      try {
        setLoading(true);
        const today = new Date().toISOString().slice(0, 10);
        const missionsRef = collection(db, `users/${user.uid}/missions`);
        const q = query(
          missionsRef,
          where('dateString', '==', today)
        );

        const snapshot = await getDocs(q);
        const missionData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DailyMission[];

        if (missionData.length === 0) {
          // Seed missions for today if missing (client-side MVP)
          await seedMissionsIfMissing(user.uid);

          // Re-fetch after seeding
          const snapshot2 = await getDocs(q);
          const missionData2 = snapshot2.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DailyMission[];
          setMissions(missionData2);
        } else {
          setMissions(missionData);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to fetch missions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch missions');
      } finally {
        setLoading(false);
      }
    };

    fetchMissions();
  }, [user?.uid]);

        const completeMission = async (missionId: string) => {
    if (!user?.uid || !db) return;
    const firestore = db;
    try {
      const missionRef = doc(firestore, `users/${user.uid}/missions`, missionId);
      // Transactionally mark mission complete and increment user xp
            const xpAwarded = await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(missionRef);
        if (!snap.exists()) throw new Error('Mission not found');
        const data = snap.data() as any;
        if (data.completed) return 0;
        const xp = typeof data.xp === 'number' ? data.xp : (typeof data.xpReward === 'number' ? data.xpReward : 0);
        const userRef = doc(firestore, 'users', user.uid);
        tx.update(missionRef, { completed: true, completedAt: serverTimestamp() });
        tx.update(userRef, { xp: increment(xp) });
        return xp;
      });

      if (xpAwarded && xpAwarded > 0) {
        // record xp event through trusted backend validation
        await logXPEvent(user.uid, 'mission', xpAwarded, { missionId });
        const mission = missions.find((m) => m.id === missionId);
                await createNotification(
          user.uid,
          'mission',
          'Mission completed',
          `You earned ${xpAwarded} XP for completing "${mission?.title || 'a mission'}".`,
          `/dashboard?mission=${missionId}`
        );
      }

      setMissions((missions) =>
        missions.map((m) =>
          m.id === missionId ? { ...m, completed: true, completedAt: new Date() } : m
        )
      );
    } catch (err) {
      console.error('Failed to complete mission:', err);
    }
  };

  return { missions, loading, error, completeMission };
}

// Hook for dashboard stats - reads directly from Firestore for real-time updates
export function useDashboardStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!user?.uid || !db) {
      setStats(null);
      return;
    }

    // Use Firestore onSnapshot for real-time subscription updates
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setStats(null);
          return;
        }

        const data = snapshot.data();
        const xp = typeof data.xp === 'number' ? data.xp : 0;
        
        // Check multiple possible locations for tier info
        // Priority: subscription.subscriptionPlan > subscriptionTier > tier > 'explorer'
        const tier = data.subscription?.subscriptionPlan 
          || data.subscription?.plan 
          || data.subscriptionTier 
          || data.tier 
          || 'explorer';

        setStats({
          currentXP: xp,
          level: Math.max(1, Math.floor(xp / 1000) + 1),
          streak: typeof data.streak === 'number' ? data.streak : 0,
          tier: tier as 'explorer' | 'pro' | 'elite',
          goal: typeof data.goal === 'string' ? data.goal : null,
        });
      },
      (error) => {
        console.error('Failed to listen to user stats:', error);
        setStats(null);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  return stats;
}

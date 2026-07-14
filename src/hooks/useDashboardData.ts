import { useEffect, useState, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  where,
  doc,
  onSnapshot,
  FirestoreError,
} from 'firebase/firestore';
import { useAuth } from '@/providers/AuthProvider';
import { awardXPAction, calculateWeeklyXP } from '@/lib/xp';
import { logger, logFirestoreError } from '@/lib/logger';
import { withRetry } from '@/lib/retry';
import { getEffectiveUserTier } from '@/lib/tier';
import { authFetch } from '@/lib/clientApi';

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

// Hook for leaderboard data with retry logic
export function useDashboardLeaderboard(limit = 10) {
  const [leaders, setLeaders] = useState<DashboardLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const fetchLeaderboard = async () => {
      if (!db) return;
      try {
        setLoading(true);
        setError(null);
        
        const usersRef = collection(db, 'publicProfiles');
        const q = query(
          usersRef,
          orderBy('xp', 'desc'),
          firestoreLimit(limit)
        );

        const snapshot = await withRetry(() => getDocs(q), {
          maxAttempts: 3,
          onRetry: (attempt, err) => {
            logger.warn(`Leaderboard fetch retry ${attempt}`, { error: err.message });
          },
        });

        const leaderboardData = snapshot.docs.map((doc, index) => ({
          id: doc.id,
          uid: doc.id,
          name: doc.data().name || 'Anonymous',
          avatar: doc.data().photoURL,
          xp: doc.data().xp || 0,
          tier: doc.data().tier || 'explorer',
          rank: index + 1,
        }));

        if (isMounted.current) {
          setLeaders(leaderboardData);
          retryCount.current = 0;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
        logFirestoreError('Leaderboard fetch', err instanceof Error ? err : new Error(errorMessage));
        
        if (isMounted.current) {
          setError(errorMessage);
          retryCount.current++;
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    fetchLeaderboard();
  }, [limit]);

  // Auto-retry on error with exponential backoff
  useEffect(() => {
    if (error && retryCount.current < maxRetries && retryCount.current > 0) {
      const delay = Math.min(1000 * Math.pow(2, retryCount.current), 10000);
      const timer = setTimeout(() => {
        setError(null);
        setLoading(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return { leaders, loading, error, retryCount: retryCount.current };
}

// Hook for user's weekly performance data
export function useWeeklyPerformance() {
  const { user } = useAuth();
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const fetchPerformance = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await calculateWeeklyXP(user.uid);
        
        if (isMounted.current && !abortControllerRef.current?.signal.aborted) {
          setPerformanceData(data);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch performance';
        logger.error('Weekly performance fetch failed', error instanceof Error ? error : undefined);
        
        if (isMounted.current) {
          setError(errorMessage);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    fetchPerformance();
  }, [user?.uid]);

  return { performanceData, loading, error };
}

// Hook for daily missions with proper subscription cleanup
export function useDailyMissions() {
  const { user } = useAuth();
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.uid || !db) {
      if (isMounted.current) setLoading(false);
      return;
    }

    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const missionsRef = collection(db, `users/${user.uid}/missions`);
    const q = query(
      missionsRef,
      where('dateString', '==', today)
    );

    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (!isMounted.current) return;

        const missionData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DailyMission[];

        if (missionData.length === 0) {
          try {
            const response = await authFetch('/api/dashboard/missions/seed', { method: 'POST' });
            if (!response.ok) throw new Error('Mission seed request failed');
          } catch (seedError) {
            logger.error('Failed to seed missions', seedError instanceof Error ? seedError : undefined);
            setLoading(false);
          }
        } else {
          setMissions(missionData);
          setLoading(false);
        }
      },
      (err: FirestoreError) => {
        logFirestoreError('Missions subscription', err, `users/${user.uid}/missions`);
        if (isMounted.current) {
          setError('Failed to load missions');
          setLoading(false);
        }
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.uid]);

  const completeMission = useCallback(async (missionId: string) => {
    if (!user?.uid || !db) return;
    
    try {
      const response = await authFetch(`/api/dashboard/missions/${encodeURIComponent(missionId)}/complete`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Mission completion failed');
      }

      const result = await response.json();
      const xpAwarded = Number(result.xpAwarded || 0);

      if (xpAwarded && xpAwarded > 0) {
        awardXPAction('mission_completed', {
          resourceId: missionId,
          metadata: { missionId },
        }).catch(err =>
          logger.error('Failed to award mission XP', err instanceof Error ? err : undefined)
        );
      }

      // Optimistic update
      if (isMounted.current) {
        setMissions((prev) =>
          prev.map((m) =>
            m.id === missionId ? { ...m, completed: true, completedAt: new Date() } : m
          )
        );
      }
    } catch (err) {
      logger.error('Failed to complete mission', err instanceof Error ? err : undefined);
      // Revert optimistic update by re-fetching
      if (isMounted.current) {
        setError('Failed to complete mission. Please try again.');
      }
    }
  }, [user?.uid]);

  return { missions, loading, error, completeMission };
}

// Hook for dashboard stats - reads directly from Firestore for real-time updates
export function useDashboardStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.uid || !db) {
      setStats(null);
      return;
    }

    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Use Firestore onSnapshot for real-time subscription updates
    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!isMounted.current) return;
        
        if (!snapshot.exists()) {
          setStats(null);
          return;
        }

        const data = snapshot.data() as Record<string, any>;
        const xp = typeof data.xp === 'number' ? data.xp : 0;
        
        const tier = getEffectiveUserTier(data);

        setStats({
          currentXP: xp,
          level: Math.max(1, Math.floor(xp / 1000) + 1),
          streak: typeof data.streak === 'number' ? data.streak : 0,
          tier: tier as 'explorer' | 'pro' | 'elite',
          goal: typeof data.goal === 'string' ? data.goal : null,
        });
      },
      (error: FirestoreError) => {
        logFirestoreError('Dashboard stats listener', error, `users/${user.uid}`);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [user?.uid]);

  return stats;
}

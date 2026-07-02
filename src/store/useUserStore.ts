import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserTier = 'explorer' | 'pro' | 'elite';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  timestamp: any;
}

interface UserState {
  // Profile Data
  xp: number;
  level: number;
  tier: UserTier;
  unlockedFeatures: string[];
  
  // History & Progress
  mentorHistory: any[];
  notifications: Notification[];
  roadmapStatus: 'not_started' | 'generating' | 'active' | 'completed';
  
  // Growth Path Discovery Engine State
  ownsLegacyBuilders: boolean;
  engagementScore: number;
  growthAssessmentResult: {
    ownsLegacyBuilders: boolean;
    readinessLevel: 'low' | 'medium' | 'high';
    businessStage: 'beginner' | 'growing' | 'advanced';
    interestAlignment: number;
    recommendedPath: string;
  } | null;
  growthAssessmentDismissed: boolean;

  // App State
  isSidebarOpen: boolean;
  activeTheme: 'dark' | 'glass' | 'high-contrast';

  // Actions
  setTier: (tier: UserTier) => void;
  addXP: (amount: number) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markNotificationRead: (id: string) => void;
  updateRoadmapStatus: (status: UserState['roadmapStatus']) => void;
  syncProfile: (data: any) => void;
  clearState: () => void;

  // Growth Engine Actions
  setLegacyBuildersOwnership: (owned: boolean) => void;
  incrementEngagementScore: (amount: number) => void;
  setGrowthAssessmentResult: (result: any) => void;
  dismissGrowthAssessment: () => void;
  resetGrowthAssessment: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      xp: 0,
      level: 1,
      tier: 'explorer',
      unlockedFeatures: ['feed', 'profile'],
      mentorHistory: [],
      notifications: [],
      roadmapStatus: 'not_started',
      
      // Default Growth Engine State
      ownsLegacyBuilders: false,
      engagementScore: 0,
      growthAssessmentResult: null,
      growthAssessmentDismissed: false,

      isSidebarOpen: true,
      activeTheme: 'dark',

      setTier: (tier) => set({ 
        tier,
        unlockedFeatures: getFeaturesForTier(tier)
      }),

      addXP: (amount) => set((state) => {
        const newXP = state.xp + amount;
        const newLevel = Math.floor(newXP / 1000) + 1;
        return { xp: newXP, level: newLevel };
      }),

      addNotification: (n) => set((state) => ({
        notifications: [
          { 
            ...n, 
            id: Math.random().toString(36).substring(7), 
            read: false, 
            timestamp: new Date() 
          },
          ...state.notifications
        ]
      })),

      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, read: true } : n
        )
      })),

      updateRoadmapStatus: (roadmapStatus) => set({ roadmapStatus }),

      syncProfile: (data) => set((state) => {
        // Only use tier from subscription if it's active
        // This prevents showing upgraded tier for pending/cancelled subscriptions
        const subscription = data.subscription;
        const isSubscriptionActive = subscription?.subscriptionStatus === 'active' || subscription?.status === 'active';
        
        // Only paid, active subscriptions should unlock paid UI.
        const newTier = isSubscriptionActive
          ? (subscription?.subscriptionPlan || subscription?.plan)
          : 'explorer';

        return {
          xp: data.xp ?? state.xp,
          level: data.level ?? state.level,
          tier: newTier,
          unlockedFeatures: getFeaturesForTier(newTier),
          // Sync Growth Engine Fields
          ownsLegacyBuilders: data.ownsLegacyBuilders ?? state.ownsLegacyBuilders,
          engagementScore: data.engagementScore ?? state.engagementScore,
          growthAssessmentResult: data.growthAssessmentResult ?? state.growthAssessmentResult,
          growthAssessmentDismissed: data.growthAssessmentDismissed ?? state.growthAssessmentDismissed,
        };
      }),

      clearState: () => set({
        xp: 0,
        level: 1,
        tier: 'explorer',
        unlockedFeatures: ['feed', 'profile'],
        mentorHistory: [],
        notifications: [],
        roadmapStatus: 'not_started',
        ownsLegacyBuilders: false,
        engagementScore: 0,
        growthAssessmentResult: null,
        growthAssessmentDismissed: false,
      }),

      setLegacyBuildersOwnership: (ownsLegacyBuilders) => set({ ownsLegacyBuilders }),
      
      incrementEngagementScore: (amount) => set((state) => ({
        engagementScore: state.engagementScore + amount
      })),

      setGrowthAssessmentResult: (growthAssessmentResult) => set({ growthAssessmentResult }),

      dismissGrowthAssessment: () => set({ growthAssessmentDismissed: true }),

      resetGrowthAssessment: () => set({
        ownsLegacyBuilders: false,
        engagementScore: 0,
        growthAssessmentResult: null,
        growthAssessmentDismissed: false,
      }),
    }),
    {
      name: 'soma-user-storage',
    }
  )
);

function getFeaturesForTier(tier: UserTier): string[] {
  const base = ['feed', 'profile', 'marketplace_view'];
  if (tier === 'pro') return [...base, 'ai_mentor_basic', 'resource_vault', 'live_calls'];
  if (tier === 'elite') return [...base, 'ai_mentor_unlimited', 'founder_direct', 'venture_network', 'advanced_analytics'];
  return base;
}

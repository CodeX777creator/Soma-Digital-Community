// AI Credit System for Soma Digital
// Strategy: Community is FREE for everyone. AI/Resources/Founder access is PREMIUM.
// This creates network effects (big community) while monetizing high-value features.

import { doc, getDoc, updateDoc, increment, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import {
  DEFAULT_CREATOR_CREDIT_ALLOCATIONS,
  DEFAULT_CREATOR_CREDIT_BUNDLES,
  normalizeCreatorCreditConfig,
} from "./creator-credit-config";

export type UserTier = 'explorer' | 'pro' | 'elite';

// FREE FOR ALL TIERS (no gating):
// - Community feed (posts, comments, likes, shares)
// - User profiles and networking
// - Public masterminds (watch only for Explorer)
// - Marketplace browsing

// GATED BY TIER:
// - AI Mentor chats (this file handles quotas)
// - Resource downloads (Pro/Elite only)
// - Live call participation (Pro/Elite only)
// - Founder 1-on-1 (Elite only)

// Monthly AI chat quotas by tier. Admin-managed Creator Credit config is the
// platform source of truth; these values are emergency client fallbacks.
export const FREE_QUOTAS: Record<UserTier, number> = {
  explorer: DEFAULT_CREATOR_CREDIT_ALLOCATIONS.explorer,
  pro: DEFAULT_CREATOR_CREDIT_ALLOCATIONS.pro,
  elite: DEFAULT_CREATOR_CREDIT_ALLOCATIONS.elite,
};

// Universal fallback rate used only where older UI needs a per-credit estimate.
export const CREDIT_PRICING: Record<UserTier, number> = {
  explorer: 10,
  pro: 10,
  elite: 10,
};

// Universal fallback bundles. Admin-managed config can change these for all tiers.
export const CREDIT_PACKAGES = DEFAULT_CREATOR_CREDIT_BUNDLES.map((bundle) => ({
  id: bundle.id,
  credits: bundle.credits,
  price: bundle.priceCents,
  label: bundle.label,
  currency: bundle.currency,
  active: bundle.active,
  sortOrder: bundle.sortOrder,
}));

export interface UserCredits {
  tier: UserTier;
  monthlyQuota: number;
  usedThisMonth: number;
  remainingFree: number;
  purchasedCredits: number;
  totalCreditsUsed: number;
  lastResetDate: any;
}

export interface UsageMetrics {
  aiChatsThisMonth: number;
  resourcesDownloaded: number;
  liveCallsAttended: number;
  lastResetDate: any;
}

async function getMonthlyQuotaForTier(tier: UserTier): Promise<number> {
  if (!db) return FREE_QUOTAS[tier];
  try {
    const snap = await getDoc(doc(db, "config", "creatorCredits"));
    if (!snap.exists()) return FREE_QUOTAS[tier];
    const config = normalizeCreatorCreditConfig(snap.data());
    return config.tierAllocations[tier] ?? FREE_QUOTAS[tier];
  } catch {
    return FREE_QUOTAS[tier];
  }
}

/**
 * Get user's current credit status
 */
export async function getUserCredits(userId: string): Promise<UserCredits | null> {
  if (!db) return null;
  
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  const tier: UserTier = data.tier || 'explorer';
  const monthlyQuota = await getMonthlyQuotaForTier(tier);
  const usedThisMonth = data.usage?.aiChatsThisMonth || 0;
  
  // Check if we need to reset monthly quota
  const lastReset = data.usage?.lastResetDate?.toDate?.() || new Date(0);
  const now = new Date();
  const shouldReset = lastReset.getMonth() !== now.getMonth() || 
                      lastReset.getFullYear() !== now.getFullYear();
  
  if (shouldReset) {
    await resetMonthlyQuota(userId);
    return {
      tier,
      monthlyQuota,
      usedThisMonth: 0,
      remainingFree: monthlyQuota,
      purchasedCredits: data.credits?.purchased || 0,
      totalCreditsUsed: data.credits?.totalUsed || 0,
      lastResetDate: serverTimestamp(),
    };
  }
  
  return {
    tier,
    monthlyQuota,
    usedThisMonth,
    remainingFree: Math.max(0, monthlyQuota - usedThisMonth),
    purchasedCredits: data.credits?.purchased || 0,
    totalCreditsUsed: data.credits?.totalUsed || 0,
    lastResetDate: data.usage?.lastResetDate,
  };
}

/**
 * Check if user can use AI chat
 */
export async function canUseAIChat(userId: string): Promise<{ allowed: boolean; reason?: string; remaining: number }> {
  const credits = await getUserCredits(userId);
  
  if (!credits) {
    return { allowed: false, reason: "User not found", remaining: 0 };
  }
  
  // Check included monthly credits
  if (credits.remainingFree > 0) {
    return { allowed: true, remaining: credits.remainingFree };
  }
  
  // Check purchased credits
  if (credits.purchasedCredits > 0) {
    return { allowed: true, remaining: credits.purchasedCredits };
  }
  
  return { 
    allowed: false, 
    reason: "Creator credits exhausted. Purchase credits or upgrade to continue.",
    remaining: 0 
  };
}

/**
 * Consume one AI chat credit
 */
export async function consumeAIChat(userId: string): Promise<{ success: boolean; remaining: number }> {
  if (!db) throw new Error("Database not initialized");
  
  const userRef = doc(db, "users", userId);
  const preflightSnap = await getDoc(userRef);
  if (!preflightSnap.exists()) throw new Error("User not found");
  const preflightTier: UserTier = preflightSnap.data().tier || "explorer";
  const monthlyQuota = await getMonthlyQuotaForTier(preflightTier);
  
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists()) throw new Error("User not found");
    
    const data = snap.data();
    const usedThisMonth = data.usage?.aiChatsThisMonth || 0;
    const purchased = data.credits?.purchased || 0;
    
    // Use included monthly credits first
    if (usedThisMonth < monthlyQuota) {
      transaction.update(userRef, {
        'usage.aiChatsThisMonth': increment(1),
        'credits.totalUsed': increment(1),
        'updatedAt': serverTimestamp(),
      });
      return { success: true, remaining: monthlyQuota - usedThisMonth - 1 };
    }
    
    // Use purchased credits
    if (purchased > 0) {
      transaction.update(userRef, {
        'credits.purchased': increment(-1),
        'credits.totalUsed': increment(1),
        'updatedAt': serverTimestamp(),
      });
      return { success: true, remaining: purchased - 1 };
    }
    
    throw new Error("No credits available");
  });
}

/**
 * Add purchased credits to user's account
 */
export async function addCredits(userId: string, amount: number): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    'credits.purchased': increment(amount),
    'updatedAt': serverTimestamp(),
  });
}

/**
 * Reset monthly quota (called at month start or manually)
 */
export async function resetMonthlyQuota(userId: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    'usage.aiChatsThisMonth': 0,
    'usage.resourcesDownloaded': 0,
    'usage.liveCallsAttended': 0,
    'usage.lastResetDate': serverTimestamp(),
    'updatedAt': serverTimestamp(),
  });
}

/**
 * Check if user can download a resource
 */
export async function canDownloadResource(
  userId: string, 
  resourceTier: 'free' | 'pro' | 'elite'
): Promise<{ allowed: boolean; reason?: string }> {
  const credits = await getUserCredits(userId);
  if (!credits) return { allowed: false, reason: "User not found" };
  
  const userTier = credits.tier;
  
  // Free resources for everyone
  if (resourceTier === 'free') return { allowed: true };
  
  // Pro resources need Pro or Elite
  if (resourceTier === 'pro') {
    if (userTier === 'pro' || userTier === 'elite') return { allowed: true };
    return { allowed: false, reason: "Upgrade to Pro to download this resource" };
  }
  
  // Elite resources need Elite
  if (resourceTier === 'elite') {
    if (userTier === 'elite') return { allowed: true };
    return { allowed: false, reason: "This is exclusive Elite content" };
  }
  
  return { allowed: false, reason: "Unknown resource tier" };
}

/**
 * Check live call eligibility
 */
export async function canJoinLiveCall(userId: string): Promise<{ 
  allowed: boolean; 
  reason?: string;
  callsRemaining: number;
}> {
  const credits = await getUserCredits(userId);
  if (!credits) return { allowed: false, reason: "User not found", callsRemaining: 0 };
  
  const userTier = credits.tier;
  const callsThisMonth = credits.usedThisMonth; // Simplified - you'd track separately
  
  if (userTier === 'explorer') {
    return { allowed: false, reason: "Live calls are Pro/Elite only", callsRemaining: 0 };
  }
  
  if (userTier === 'elite') {
    return { allowed: true, callsRemaining: Infinity };
  }
  
  // Pro: 1 call/month
  const proCallsUsed = credits.usedThisMonth; // You'd track this separately
  const proCallsLimit = 1;
  const remaining = proCallsLimit - proCallsUsed;
  
  if (remaining <= 0) {
    return { allowed: false, reason: "Monthly call limit reached", callsRemaining: 0 };
  }
  
  return { allowed: true, callsRemaining: remaining };
}

/**
 * Get upgrade recommendation message
 */
export function getUpgradeMessage(currentTier: UserTier, feature: string): string {
  const messages: Record<UserTier, string> = {
    explorer: `You've reached your free limit. Upgrade to Pro for 10x more ${feature}!`,
    pro: `Maximize your growth with Elite - unlimited ${feature} + direct founder access.`,
    elite: `You're enjoying unlimited access!`,
  };
  
  return messages[currentTier];
}

import "server-only";

import { admin, adminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { sanitizeString } from "@/lib/security";
import { hashRequestSignature } from "./crypto";
import { creatorCreditPolicies, planCreditProfiles } from "./config";
import type {
  AIExecutionContext,
  AIExecutionLease,
  BillingSource,
  CreditLedgerEntry,
  CreatorCreditSnapshot,
  CreatorPlan,
  MonetizedFeature,
  ProviderMode,
} from "./types";

type CreditAccountDoc = {
  userId: string;
  plan: CreatorPlan;
  periodId: string;
  monthlyCreditsGranted: number;
  monthlyCreditsUsed: number;
  monthlyCreditsReserved: number;
  remainingCredits: number;
  byokEnabled: boolean;
  providerMode: ProviderMode;
  resetAt: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  nextResetAt: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  activeFeatureCounts: Partial<Record<MonetizedFeature, number>>;
  lastUpdatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
};

function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function firstDayOfNextMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return null;
}

function accountRef(userId: string) {
  return adminDb.collection("creatorCreditAccounts").doc(userId);
}

function ledgerRef() {
  return adminDb.collection("creatorCreditLedger");
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getCreditsForPlan(plan: CreatorPlan): number {
  return planCreditProfiles[plan].monthlyCreatorCredits;
}

export function resolveFeatureCredits(plan: CreatorPlan, feature: MonetizedFeature): number {
  const override = planCreditProfiles[plan].featureOverrides?.[feature];
  return typeof override === "number" ? override : creatorCreditPolicies[feature].baseCredits;
}

export function estimateCreditCost(plan: CreatorPlan, feature: MonetizedFeature, quantity = 1): number {
  const featureCredits = resolveFeatureCredits(plan, feature);
  return Math.max(0, featureCredits * Math.max(1, quantity));
}

export function createRequestSignature(input: {
  userId: string;
  feature: MonetizedFeature;
  task: string;
  message: string;
  modelId?: string;
}): string {
  return hashRequestSignature([
    input.userId,
    input.feature,
    input.task,
    input.modelId || "auto",
    sanitizeString(input.message, 2048),
  ].join("|"));
}

function serializeAccount(doc: CreditAccountDoc): CreatorCreditSnapshot {
  return {
    userId: doc.userId,
    plan: doc.plan,
    periodId: doc.periodId,
    monthlyCreditsGranted: safeCount(doc.monthlyCreditsGranted),
    monthlyCreditsUsed: safeCount(doc.monthlyCreditsUsed),
    monthlyCreditsReserved: safeCount(doc.monthlyCreditsReserved),
    remainingCredits: safeCount(doc.remainingCredits),
    byokEnabled: doc.byokEnabled === true,
    providerMode: doc.providerMode || "hybrid",
    resetAt: toIso(doc.resetAt) || new Date().toISOString(),
    nextResetAt: toIso(doc.nextResetAt) || firstDayOfNextMonth().toISOString(),
    activeFeatureCounts: doc.activeFeatureCounts || {},
    lastUpdatedAt: toIso(doc.lastUpdatedAt),
  };
}

async function getOrCreateAccount(userId: string, plan: CreatorPlan, providerMode: ProviderMode): Promise<CreditAccountDoc> {
  const ref = accountRef(userId);
  const snap = await ref.get();
  const periodId = currentPeriod();
  const nextResetAt = admin.firestore.Timestamp.fromDate(firstDayOfNextMonth());

  if (!snap.exists) {
    const doc: CreditAccountDoc = {
      userId,
      plan,
      periodId,
      monthlyCreditsGranted: getCreditsForPlan(plan),
      monthlyCreditsUsed: 0,
      monthlyCreditsReserved: 0,
      remainingCredits: getCreditsForPlan(plan),
      byokEnabled: false,
      providerMode,
      resetAt: admin.firestore.Timestamp.now(),
      nextResetAt,
      activeFeatureCounts: {},
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(doc);
    return doc;
  }

  const data = snap.data() as CreditAccountDoc;
  const next = { ...data };
  const accountPeriod = data.periodId || periodId;
  if (accountPeriod !== periodId) {
    next.periodId = periodId;
    next.monthlyCreditsGranted = getCreditsForPlan(plan);
    next.monthlyCreditsUsed = 0;
    next.monthlyCreditsReserved = 0;
    next.remainingCredits = getCreditsForPlan(plan);
    next.plan = plan;
    next.resetAt = admin.firestore.Timestamp.now();
    next.nextResetAt = nextResetAt;
    next.lastUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(next, { merge: true });
    return next;
  }

  return {
    ...data,
    plan,
    providerMode,
  };
}

export async function getCreatorCreditSnapshot(userId: string, plan: CreatorPlan, providerMode: ProviderMode): Promise<CreatorCreditSnapshot> {
  const account = await getOrCreateAccount(userId, plan, providerMode);
  return serializeAccount(account);
}

export async function setByokEnabled(userId: string, enabled: boolean, providerMode: ProviderMode): Promise<CreatorCreditSnapshot> {
  const ref = accountRef(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Credit account not found");
  }

  await ref.set({
    byokEnabled: enabled,
    providerMode,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const next = await ref.get();
  return serializeAccount(next.data() as CreditAccountDoc);
}

export async function listCreditLedger(userId: string, limit = 50): Promise<CreditLedgerEntry[]> {
  const snapshot = await ledgerRef()
    .where("userId", "==", userId)
    .orderBy("timestamp", "desc")
    .limit(Math.min(Math.max(limit, 1), 200))
    .get();

  return snapshot.docs.map((doc) => doc.data() as CreditLedgerEntry);
}

export async function reserveCredits(context: AIExecutionContext, credits: number, estimatedCostUsd: number, billingSource: BillingSource): Promise<AIExecutionLease> {
  const periodId = currentPeriod();
  const leaseId = `lease_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const requestId = context.requestId || createRequestSignature({
    userId: context.userId,
    feature: context.feature,
    task: context.task,
    message: context.message,
  });
  const providerId = context.providerPreference || "vercel-ai-gateway";
  const modelId = context.metadata?.modelId as string | undefined || "auto";
  const accountRefDoc = accountRef(context.userId);

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(accountRefDoc);
    if (!snap.exists) {
      throw new Error("Credit account missing");
    }

    const data = snap.data() as CreditAccountDoc;
    if (billingSource === "sdc_credits") {
      if (data.remainingCredits < credits) {
        throw new Error("Creator credits exhausted");
      }

      transaction.set(accountRefDoc, {
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(credits),
        remainingCredits: admin.firestore.FieldValue.increment(-credits),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      transaction.set(accountRefDoc, {
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(ledgerRef().doc(leaseId), {
      entryId: leaseId,
      userId: context.userId,
      periodId,
      timestamp: new Date().toISOString(),
      task: context.task,
      modality: context.modality,
      feature: context.feature,
      providerId,
      modelId,
      billingSource,
      creditsReserved: billingSource === "sdc_credits" ? credits : 0,
      creditsCharged: 0,
      creditsRefunded: 0,
      durationMs: 0,
      status: "reserved",
      requestId,
      reason: context.metadata?.reason ? String(context.metadata.reason) : undefined,
      providerMode: context.providerMode || "hybrid",
      estimatedCostUsd,
      metadata: context.metadata,
    } satisfies CreditLedgerEntry);
  });

  logger.info("[AI Credits] Reserved credits", {
    userId: context.userId,
    feature: context.feature,
    credits,
    billingSource,
    leaseId,
  });

  return {
    traceId: requestId,
    leaseId,
    requestId,
    userId: context.userId,
    feature: context.feature,
    task: context.task,
    modality: context.modality,
    providerId,
    modelId,
    billingSource,
    creditsReserved: billingSource === "sdc_credits" ? credits : 0,
    estimatedCostUsd,
    providerMode: context.providerMode || "hybrid",
    periodId,
  };
}

export async function finalizeCredits(lease: AIExecutionLease, input: {
  durationMs: number;
  creditsCharged?: number;
  actualCostUsd?: number;
  modelId: string;
  providerId: string;
  status: "charged" | "skipped";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const ledgerDoc = ledgerRef().doc(lease.leaseId);
  const accountDoc = accountRef(lease.userId);

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ledgerDoc);
    if (!snap.exists) {
      throw new Error("Ledger entry missing");
    }

    const ledger = snap.data() as CreditLedgerEntry;
    const charged = input.status === "charged" ? (input.creditsCharged ?? lease.creditsReserved) : 0;
    const refunded = Math.max(0, lease.creditsReserved - charged);

    transaction.set(ledgerDoc, {
      ...ledger,
      modelId: input.modelId,
      providerId: input.providerId as any,
      durationMs: input.durationMs,
      creditsCharged: charged,
      creditsRefunded: refunded,
      status: input.status,
      actualCostUsd: input.actualCostUsd,
      metadata: {
        ...(ledger.metadata || {}),
        ...(input.metadata || {}),
      },
    } satisfies CreditLedgerEntry, { merge: true });

    if (lease.billingSource === "sdc_credits") {
      transaction.set(accountDoc, {
        monthlyCreditsUsed: admin.firestore.FieldValue.increment(charged),
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(-lease.creditsReserved),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (refunded > 0) {
        transaction.set(accountDoc, {
          remainingCredits: admin.firestore.FieldValue.increment(refunded),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  });
}

export async function refundCredits(lease: AIExecutionLease, reason: string, metadata?: Record<string, unknown>): Promise<void> {
  const ledgerDoc = ledgerRef().doc(lease.leaseId);
  const accountDoc = accountRef(lease.userId);

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ledgerDoc);
    if (!snap.exists) {
      throw new Error("Ledger entry missing");
    }

    const ledger = snap.data() as CreditLedgerEntry;
    transaction.set(ledgerDoc, {
      ...ledger,
      creditsRefunded: lease.creditsReserved,
      creditsCharged: 0,
      status: "refunded",
      reason,
      metadata: {
        ...(ledger.metadata || {}),
        ...(metadata || {}),
      },
    } satisfies CreditLedgerEntry, { merge: true });

    if (lease.billingSource === "sdc_credits" && lease.creditsReserved > 0) {
      transaction.set(accountDoc, {
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(-lease.creditsReserved),
        remainingCredits: admin.firestore.FieldValue.increment(lease.creditsReserved),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

export async function getCreatorCreditDashboard(userId: string, plan: CreatorPlan, providerMode: ProviderMode) {
  const snapshot = await getCreatorCreditSnapshot(userId, plan, providerMode);
  const ledger = await listCreditLedger(userId, 25);

  return {
    snapshot,
    creditPolicies: creatorCreditPolicies,
    planProfile: planCreditProfiles[plan],
    recentActivity: ledger,
    providerMode,
    byokEnabled: snapshot.byokEnabled,
    nextResetAt: snapshot.nextResetAt,
    resetAt: snapshot.resetAt,
    budgetSummary: {
      monthlyCap: planCreditProfiles[plan].monthlyEstimatedAIExpenseCap,
      dailyCap: planCreditProfiles[plan].dailySpendingLimit,
      concurrentJobs: planCreditProfiles[plan].concurrentJobLimit,
    },
  };
}

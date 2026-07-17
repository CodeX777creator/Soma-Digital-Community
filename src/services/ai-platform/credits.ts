import "server-only";

import { admin, adminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { sanitizeString } from "@/lib/security";
import { hashRequestSignature } from "./crypto";
import { creatorCreditPolicies, planCreditProfiles } from "./config";
import { normalizeCreatorCreditConfig } from "@/lib/creator-credit-config";
import type {
  AIExecutionContext,
  AIExecutionLease,
  BillingSource,
  CreditLedgerEntry,
  CreatorCreditSnapshot,
  CreatorPlan,
  MonetizedFeature,
  PlanCreditProfile,
  ProviderMode,
} from "./types";

type CreditAccountDoc = {
  userId: string;
  plan: CreatorPlan;
  periodId: string;
  monthlyCreditsGranted: number;
  monthlyCreditsUsed: number;
  monthlyCreditsReserved: number;
  purchasedCreditsGranted?: number;
  purchasedCreditsRemaining?: number;
  remainingCredits: number;
  byokEnabled: boolean;
  providerMode: ProviderMode;
  resetAt: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  nextResetAt: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  activeFeatureCounts: Partial<Record<MonetizedFeature, number>>;
  lastUpdatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
};

function normalizeCreatorPlan(plan: CreatorPlan | string | undefined): CreatorPlan {
  if (plan === "pro" || plan === "elite" || plan === "enterprise") return plan;
  return "explorer";
}

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

async function getCreditsForPlan(plan: CreatorPlan): Promise<number> {
  try {
    const snap = await adminDb.collection("config").doc("creatorCredits").get();
    if (!snap.exists) return planCreditProfiles[plan].monthlyCreatorCredits;
    const config = normalizeCreatorCreditConfig(snap.data());
    return config.tierAllocations[plan] ?? planCreditProfiles[plan].monthlyCreatorCredits;
  } catch (error) {
    logger.warn("[AI Credits] Falling back to default plan credits", {
      plan,
      error: error instanceof Error ? error.message : String(error),
    });
    return planCreditProfiles[plan].monthlyCreatorCredits;
  }
}

async function getLegacyPurchasedCredits(userId: string): Promise<number> {
  try {
    const snap = await adminDb.collection("users").doc(userId).get();
    const purchased = snap.data()?.credits?.purchased;
    return safeCount(purchased);
  } catch (error) {
    logger.warn("[AI Credits] Unable to read legacy purchased credits", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function getPlanProfile(plan: CreatorPlan): Promise<PlanCreditProfile> {
  return {
    ...planCreditProfiles[plan],
    monthlyCreatorCredits: await getCreditsForPlan(plan),
  };
}

export function resolveFeatureCredits(plan: CreatorPlan, feature: MonetizedFeature): number {
  const override = planCreditProfiles[plan].featureOverrides?.[feature];
  return typeof override === "number" ? override : creatorCreditPolicies[feature].baseCredits;
}

export async function resolveFeatureCreditsFromConfig(plan: CreatorPlan, feature: MonetizedFeature): Promise<number> {
  try {
    const snap = await adminDb.collection("config").doc("creatorCredits").get();
    if (snap.exists) {
      const config = normalizeCreatorCreditConfig(snap.data());
      const configured = config.featurePricing[feature];
      if (typeof configured === "number" && Number.isFinite(configured) && configured >= 0) {
        return configured;
      }
    }
  } catch (error) {
    logger.warn("[AI Credits] Falling back to default feature credits", {
      plan,
      feature,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return resolveFeatureCredits(plan, feature);
}

export async function estimateCreditCost(plan: CreatorPlan, feature: MonetizedFeature, quantity = 1): Promise<number> {
  const featureCredits = await resolveFeatureCreditsFromConfig(plan, feature);
  return Math.max(0, featureCredits * Math.max(1, quantity));
}

export function estimateDefaultCreditCost(plan: CreatorPlan, feature: MonetizedFeature, quantity = 1): number {
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
    purchasedCreditsGranted: safeCount(doc.purchasedCreditsGranted),
    purchasedCreditsRemaining: safeCount(doc.purchasedCreditsRemaining),
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
  const monthlyCredits = await getCreditsForPlan(plan);

  if (!snap.exists) {
    const legacyPurchasedCredits = await getLegacyPurchasedCredits(userId);
    const doc: CreditAccountDoc = {
      userId,
      plan,
      periodId,
      monthlyCreditsGranted: monthlyCredits,
      monthlyCreditsUsed: 0,
      monthlyCreditsReserved: 0,
      purchasedCreditsGranted: legacyPurchasedCredits,
      purchasedCreditsRemaining: legacyPurchasedCredits,
      remainingCredits: monthlyCredits + legacyPurchasedCredits,
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
  const needsLegacyPurchasedMigration =
    typeof data.purchasedCreditsGranted !== "number" ||
    typeof data.purchasedCreditsRemaining !== "number";
  const legacyPurchasedCredits = needsLegacyPurchasedMigration
    ? await getLegacyPurchasedCredits(userId)
    : 0;
  if (needsLegacyPurchasedMigration) {
    next.purchasedCreditsGranted = legacyPurchasedCredits;
    next.purchasedCreditsRemaining = legacyPurchasedCredits;
    next.remainingCredits = safeCount(next.remainingCredits) + legacyPurchasedCredits;
  }
  const accountPeriod = data.periodId || periodId;
  if (accountPeriod !== periodId) {
    const purchasedCreditsRemaining = safeCount(next.purchasedCreditsRemaining);
    next.periodId = periodId;
    next.monthlyCreditsGranted = monthlyCredits;
    next.monthlyCreditsUsed = 0;
    next.monthlyCreditsReserved = 0;
    next.purchasedCreditsRemaining = purchasedCreditsRemaining;
    next.purchasedCreditsGranted = safeCount(next.purchasedCreditsGranted);
    next.remainingCredits = monthlyCredits + purchasedCreditsRemaining;
    next.plan = plan;
    next.resetAt = admin.firestore.Timestamp.now();
    next.nextResetAt = nextResetAt;
    next.lastUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(next, { merge: true });
    return next;
  }

  if (
    safeCount(data.monthlyCreditsGranted) !== monthlyCredits ||
    data.plan !== plan ||
    data.providerMode !== providerMode ||
    needsLegacyPurchasedMigration
  ) {
    const purchasedCreditsRemaining = safeCount(next.purchasedCreditsRemaining);
    next.monthlyCreditsGranted = monthlyCredits;
    next.remainingCredits = Math.max(
      0,
      monthlyCredits - safeCount(data.monthlyCreditsUsed) - safeCount(data.monthlyCreditsReserved)
    ) + purchasedCreditsRemaining;
    next.purchasedCreditsRemaining = purchasedCreditsRemaining;
    next.purchasedCreditsGranted = safeCount(next.purchasedCreditsGranted);
    next.plan = plan;
    next.providerMode = providerMode;
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
  let includedCreditsReserved = 0;
  let purchasedCreditsReserved = 0;

  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(accountRefDoc);
    if (!snap.exists) {
      throw new Error("Credit account missing");
    }

    const data = snap.data() as CreditAccountDoc;
    if (billingSource === "sdc_credits") {
      const includedAvailable = Math.max(
        0,
        safeCount(data.monthlyCreditsGranted) - safeCount(data.monthlyCreditsUsed) - safeCount(data.monthlyCreditsReserved)
      );
      includedCreditsReserved = Math.min(credits, includedAvailable);
      purchasedCreditsReserved = Math.max(0, credits - includedCreditsReserved);

      if (safeCount(data.remainingCredits) < credits || safeCount(data.purchasedCreditsRemaining) < purchasedCreditsReserved) {
        throw new Error("Creator credits exhausted");
      }

      transaction.set(accountRefDoc, {
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(includedCreditsReserved),
        purchasedCreditsRemaining: admin.firestore.FieldValue.increment(-purchasedCreditsReserved),
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
      includedCreditsReserved,
      purchasedCreditsReserved,
      creditsCharged: 0,
      creditsRefunded: 0,
      durationMs: 0,
      status: "reserved",
      requestId,
      reason: context.metadata?.reason ? String(context.metadata.reason) : undefined,
      providerMode: context.providerMode || "hybrid",
      estimatedCostUsd,
      pricingUnit: context.metadata?.pricingUnit as any,
      estimatedUnits: typeof context.metadata?.estimatedUnits === "number" ? context.metadata.estimatedUnits : undefined,
      unitRateCredits: typeof context.metadata?.unitRateCredits === "number" ? context.metadata.unitRateCredits : undefined,
      inputTokens: typeof context.metadata?.inputTokens === "number" ? context.metadata.inputTokens : undefined,
      outputTokens: typeof context.metadata?.outputTokens === "number" ? context.metadata.outputTokens : undefined,
      imageCount: typeof context.metadata?.imageCount === "number" ? context.metadata.imageCount : undefined,
      durationSeconds: typeof context.metadata?.durationSeconds === "number" ? context.metadata.durationSeconds : undefined,
      characters: typeof context.metadata?.characters === "number" ? context.metadata.characters : undefined,
      modelPricingSnapshot: context.metadata?.modelPricingSnapshot && typeof context.metadata.modelPricingSnapshot === "object"
        ? context.metadata.modelPricingSnapshot as Record<string, unknown>
        : undefined,
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
    includedCreditsReserved: billingSource === "sdc_credits" ? includedCreditsReserved : 0,
    purchasedCreditsReserved: billingSource === "sdc_credits" ? purchasedCreditsReserved : 0,
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
    const includedReserved = Math.max(0, lease.includedCreditsReserved || 0);
    const purchasedReserved = Math.max(0, lease.purchasedCreditsReserved || 0);
    const includedCharged = Math.min(charged, includedReserved);
    const purchasedCharged = Math.min(Math.max(0, charged - includedCharged), purchasedReserved);
    const refunded = Math.max(0, lease.creditsReserved - charged);
    const includedRefunded = Math.max(0, includedReserved - includedCharged);
    const purchasedRefunded = Math.max(0, purchasedReserved - purchasedCharged);

    transaction.set(ledgerDoc, {
      ...ledger,
      modelId: input.modelId,
      providerId: input.providerId as any,
      durationMs: input.durationMs,
      creditsCharged: charged,
      creditsRefunded: refunded,
      status: input.status,
      actualCostUsd: input.actualCostUsd,
      actualUnits: typeof input.metadata?.actualUnits === "number" ? input.metadata.actualUnits : ledger.actualUnits,
      pricingUnit: typeof input.metadata?.pricingUnit === "string" ? input.metadata.pricingUnit as any : ledger.pricingUnit,
      estimatedUnits: typeof input.metadata?.estimatedUnits === "number" ? input.metadata.estimatedUnits : ledger.estimatedUnits,
      unitRateCredits: typeof input.metadata?.unitRateCredits === "number" ? input.metadata.unitRateCredits : ledger.unitRateCredits,
      inputTokens: typeof input.metadata?.inputTokens === "number" ? input.metadata.inputTokens : ledger.inputTokens,
      outputTokens: typeof input.metadata?.outputTokens === "number" ? input.metadata.outputTokens : ledger.outputTokens,
      imageCount: typeof input.metadata?.imageCount === "number" ? input.metadata.imageCount : ledger.imageCount,
      durationSeconds: typeof input.metadata?.durationSeconds === "number" ? input.metadata.durationSeconds : ledger.durationSeconds,
      characters: typeof input.metadata?.characters === "number" ? input.metadata.characters : ledger.characters,
      modelPricingSnapshot: input.metadata?.modelPricingSnapshot && typeof input.metadata.modelPricingSnapshot === "object"
        ? input.metadata.modelPricingSnapshot as Record<string, unknown>
        : ledger.modelPricingSnapshot,
      metadata: {
        ...(ledger.metadata || {}),
        ...(input.metadata || {}),
      },
    } satisfies CreditLedgerEntry, { merge: true });

    if (lease.billingSource === "sdc_credits") {
      transaction.set(accountDoc, {
        monthlyCreditsUsed: admin.firestore.FieldValue.increment(includedCharged),
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(-includedReserved),
        purchasedCreditsRemaining: admin.firestore.FieldValue.increment(purchasedRefunded),
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
    const includedReserved = Math.max(0, lease.includedCreditsReserved || 0);
    const purchasedReserved = Math.max(0, lease.purchasedCreditsReserved || 0);
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
        monthlyCreditsReserved: admin.firestore.FieldValue.increment(-includedReserved),
        purchasedCreditsRemaining: admin.firestore.FieldValue.increment(purchasedReserved),
        remainingCredits: admin.firestore.FieldValue.increment(lease.creditsReserved),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

export async function recordSkippedCredits(
  context: AIExecutionContext,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<CreditLedgerEntry> {
  const periodId = currentPeriod();
  const entryId = `skip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const requestId = context.requestId || createRequestSignature({
    userId: context.userId,
    feature: context.feature,
    task: context.task,
    message: context.message,
  });
  const plan = normalizeCreatorPlan(context.userTier);
  await getOrCreateAccount(context.userId, plan, context.providerMode || "hybrid");

  const entry: CreditLedgerEntry = {
    entryId,
    userId: context.userId,
    periodId,
    timestamp: new Date().toISOString(),
    task: context.task,
    modality: context.modality,
    feature: context.feature,
    providerId: context.providerPreference || "vercel-ai-gateway",
    modelId: typeof context.metadata?.modelId === "string" ? context.metadata.modelId : "cached",
    billingSource: "sdc_credits",
    creditsReserved: 0,
    creditsCharged: 0,
    creditsRefunded: 0,
    durationMs: 0,
    status: "skipped",
    requestId,
    reason,
    providerMode: context.providerMode || "hybrid",
    estimatedCostUsd: 0,
    actualCostUsd: 0,
    metadata: {
      ...(context.metadata || {}),
      ...(metadata || {}),
    },
  };

  await ledgerRef().doc(entryId).set(entry);
  return entry;
}

export async function getCreatorCreditDashboard(userId: string, plan: CreatorPlan, providerMode: ProviderMode) {
  const snapshot = await getCreatorCreditSnapshot(userId, plan, providerMode);
  const ledger = await listCreditLedger(userId, 25);
  const planProfile = await getPlanProfile(plan);
  const configSnap = await adminDb.collection("config").doc("creatorCredits").get();
  const config = normalizeCreatorCreditConfig(configSnap.exists ? configSnap.data() : undefined);

  return {
    snapshot,
    creditPolicies: config.featurePricing,
    toolPricing: config.toolPricing,
    planProfile,
    recentActivity: ledger,
    providerMode,
    byokEnabled: snapshot.byokEnabled,
    nextResetAt: snapshot.nextResetAt,
    resetAt: snapshot.resetAt,
    budgetSummary: {
      monthlyCap: planProfile.monthlyEstimatedAIExpenseCap,
      dailyCap: planProfile.dailySpendingLimit,
      concurrentJobs: planProfile.concurrentJobLimit,
    },
  };
}

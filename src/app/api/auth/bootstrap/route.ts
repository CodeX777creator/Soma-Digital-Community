import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { getSubscriptionPlan, normalizeSubscription, type SubscriptionPlan } from "@/lib/entitlements";
import { sanitizeString } from "@/lib/security";

type BootstrapBody = {
  displayName?: unknown;
  onboardingComplete?: unknown;
  onboarding?: {
    identities?: unknown;
    goal?: unknown;
    skillLevel?: unknown;
    intendedPlan?: unknown;
    budget?: unknown;
    availableTime?: unknown;
  };
};

const VALID_PLANS: SubscriptionPlan[] = ["explorer", "pro", "elite"];

function sanitizeOptionalString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? sanitizeString(value, maxLength) : null;
}

function sanitizeIdentities(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => sanitizeString(item, 80))
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function getExistingRoles(profile: Record<string, any> | null | undefined) {
  return Array.isArray(profile?.roles)
    ? profile.roles.filter((role: unknown): role is string => typeof role === "string")
    : [];
}

function isAdminProfile(profile: Record<string, any> | null | undefined) {
  const roles = getExistingRoles(profile);
  return profile?.isAdmin === true || profile?.role === "admin" || roles.includes("admin");
}

function buildExplorerSubscription(uid: string) {
  const subscriptionId = `system_explorer_${uid}`;
  return {
    provider: "system",
    subscriptionId,
    userId: uid,
    subscriptionPlan: "explorer" as const,
    planId: "explorer" as const,
    plan: "explorer" as const,
    subscriptionStatus: "active" as const,
    status: "active" as const,
    currentPeriodEnd: null,
  };
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

async function resolveSubscription(uid: string, profile: Record<string, any> | null | undefined) {
  const summary = normalizeSubscription(profile?.subscription);

  if (summary.subscriptionId) {
    const snap = await adminDb.collection("subscriptions").doc(summary.subscriptionId).get();
    if (snap.exists && snap.data()?.userId === uid) {
      return normalizeSubscription({
        ...snap.data(),
        subscriptionId: snap.id,
      });
    }
  }

  const latest = await adminDb
    .collection("subscriptions")
    .where("userId", "==", uid)
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  if (!latest.empty) {
    const doc = latest.docs[0];
    return normalizeSubscription({
      ...doc.data(),
      subscriptionId: doc.id,
    });
  }

  return buildExplorerSubscription(uid);
}

export const POST = createAPIHandler(
  async (req) => {
    const { uid } = await requireAuth(req as any);
    const firebaseUser = await adminAuth.getUser(uid);
    const body = (await req.json().catch(() => ({}))) as BootstrapBody;

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? userSnap.data() || {} : null;
    const isAdmin = isAdminProfile(existing);
    const roles = getExistingRoles(existing);
    const subscription = await resolveSubscription(uid, existing);
    const tier = getSubscriptionPlan(subscription.subscriptionPlan);
    const now = FieldValue.serverTimestamp();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const lastLogin = toDate(existing?.lastLogin);
    const shouldRecordLogin = !lastLogin || !isSameDay(lastLogin, today);
    const previousStreak = typeof existing?.streak === "number" ? existing.streak : 0;
    const nextStreak = !lastLogin
      ? 1
      : isSameDay(lastLogin, yesterday)
        ? previousStreak + 1
        : 1;
    const displayName =
      sanitizeOptionalString(body.displayName, 160) ||
      sanitizeOptionalString(firebaseUser.displayName, 160) ||
      sanitizeOptionalString(existing?.name, 160) ||
      sanitizeOptionalString(existing?.displayName, 160) ||
      "Explorer";
    const intendedPlan = VALID_PLANS.includes(body.onboarding?.intendedPlan as SubscriptionPlan)
      ? (body.onboarding?.intendedPlan as SubscriptionPlan)
      : undefined;

    const update: Record<string, any> = {
      uid,
      email: firebaseUser.email || existing?.email || "",
      name: displayName,
      displayName,
      photoURL: firebaseUser.photoURL || existing?.photoURL || null,
      avatarURL: firebaseUser.photoURL || existing?.avatarURL || null,
      emailVerified: firebaseUser.emailVerified === true,
      role: isAdmin ? "admin" : existing?.role || "member",
      roles: isAdmin ? Array.from(new Set([...roles, "admin"])) : roles.filter((role) => role !== "admin"),
      isAdmin: isAdmin ? true : existing?.isAdmin === true,
      tier,
      subscriptionTier: tier,
      subscription,
      subscriptionPlan: subscription.subscriptionPlan,
      subscriptionStatus: subscription.subscriptionStatus,
      onboardingComplete: existing?.onboardingComplete === true || body.onboardingComplete === true,
      xp: typeof existing?.xp === "number" ? existing.xp : 0,
      level: typeof existing?.level === "number" ? existing.level : 1,
      streak: shouldRecordLogin ? nextStreak : previousStreak,
      roadmapGenerated: existing?.roadmapGenerated === true,
      updatedAt: now,
      lastLogin: shouldRecordLogin ? now : existing?.lastLogin || now,
    };

    if (!userSnap.exists) {
      update.createdAt = now;
    }

    if (shouldRecordLogin) {
      update.xp = FieldValue.increment(5);
      update.lastLoginAwardedAt = now;
    }

    const identities = sanitizeIdentities(body.onboarding?.identities);
    if (identities) update.identities = identities;
    const goal = sanitizeOptionalString(body.onboarding?.goal, 240);
    if (goal) update.goal = goal;
    const skillLevel = sanitizeOptionalString(body.onboarding?.skillLevel, 120);
    if (skillLevel) update.skillLevel = skillLevel;
    if (intendedPlan) update.intendedPlan = intendedPlan;
    const budget = sanitizeOptionalString(body.onboarding?.budget, 120);
    if (budget) update.budget = budget;
    const availableTime = sanitizeOptionalString(body.onboarding?.availableTime, 120);
    if (availableTime) update.availableTime = availableTime;

    const batch = adminDb.batch();
    batch.set(adminDb.collection("subscriptions").doc(subscription.subscriptionId || `system_explorer_${uid}`), {
      ...subscription,
      userId: uid,
      updatedAt: now,
      createdAt: existing?.subscription?.createdAt || now,
    }, { merge: true });
    batch.set(userRef, update, { merge: true });
    batch.set(adminDb.collection("publicProfiles").doc(uid), {
      uid,
      name: displayName,
      displayName,
      photoURL: update.photoURL,
      avatarURL: update.avatarURL,
      tier,
      xp: shouldRecordLogin ? FieldValue.increment(5) : update.xp,
      level: update.level,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }, { merge: true });
    await batch.commit();

    const updatedSnap = await userRef.get();
    const profile = updatedSnap.data();
    if (!profile) {
      return apiError("Unable to load initialized account", { status: 500, code: "BOOTSTRAP_FAILED" });
    }

    return apiResponse({ profile }, { cache: { maxAge: 0, private: true } });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 20000,
  }
);

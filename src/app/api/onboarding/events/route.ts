import { FieldValue } from "firebase-admin/firestore";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { sanitizeString } from "@/lib/security";

const VALID_EVENTS = new Set([
  "onboarding_started",
  "onboarding_step_viewed",
  "onboarding_step_completed",
  "onboarding_account_created",
  "onboarding_roadmap_generated",
  "onboarding_completed",
  "onboarding_abandoned",
]);

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const safeKey = sanitizeString(key, 80);
    if (!safeKey) continue;
    if (typeof raw === "string") clean[safeKey] = sanitizeString(raw, 500);
    else if (typeof raw === "number" || typeof raw === "boolean" || raw === null) clean[safeKey] = raw;
    else if (Array.isArray(raw)) clean[safeKey] = raw.slice(0, 20).map((item) => typeof item === "string" ? sanitizeString(item, 120) : item);
  }
  return clean;
}

export const POST = createAPIHandler(
  async (req) => {
    const body = await req.json().catch(() => ({}));
    const event = typeof body.event === "string" && VALID_EVENTS.has(body.event)
      ? body.event
      : "onboarding_step_viewed";

    await adminDb.collection("onboardingEvents").add({
      event,
      metadata: sanitizeMetadata(body.metadata),
      path: typeof body.path === "string" ? sanitizeString(body.path, 240) : null,
      search: typeof body.search === "string" ? sanitizeString(body.search, 500) : null,
      occurredAt: typeof body.occurredAt === "string" ? sanitizeString(body.occurredAt, 80) : null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return apiResponse({ ok: true }, { cache: { maxAge: 0, private: true } });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 40 },
    timeout: 10000,
  }
);

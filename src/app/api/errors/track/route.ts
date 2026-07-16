import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";

const ALLOWED_EVENTS = new Set([
  "error_shown",
  "api_error",
  "generation_failed",
  "oauth_failed",
  "upload_failed",
  "permission_denied",
  "credit_blocked",
  "route_error_boundary_triggered",
]);

function cleanString(value: unknown, fallback = "unknown", max = 240) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.slice(0, max);
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(metadata).slice(0, 20).map(([key, item]) => {
      const lower = key.toLowerCase();
      if (["token", "secret", "key", "authorization", "cookie", "oauth", "code", "prompt", "password"].some((needle) => lower.includes(needle))) {
        return [key, "[redacted]"];
      }
      return [key, typeof item === "string" ? item.slice(0, 240) : item];
    })
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const event = cleanString(body.event);
    if (!ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ ok: false, error: "Unsupported event" }, { status: 400 });
    }

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") || "";
    const [, token] = authHeader.split(" ");
    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        userId = decoded.uid;
      } catch {
        userId = null;
      }
    }

    await adminDb.collection("appErrorEvents").add({
      event,
      userId,
      requestId: cleanString(body.requestId, "", 120) || null,
      route: cleanString(body.route, "", 240) || null,
      action: cleanString(body.action, "", 120) || null,
      feature: cleanString(body.feature, "", 120) || null,
      severity: cleanString(body.severity, "error", 40),
      code: cleanString(body.code, "UNKNOWN_ERROR", 120),
      category: cleanString(body.category, "unknown", 80),
      retryable: body.retryable === true,
      status: typeof body.status === "number" ? body.status : null,
      userMessage: cleanString(body.userMessage, "", 240) || null,
      metadata: cleanMetadata(body.metadata),
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.warn("[ErrorTracking] Failed to persist error event", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: true });
  }
}

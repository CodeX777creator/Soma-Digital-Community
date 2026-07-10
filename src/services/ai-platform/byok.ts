import "server-only";

import { admin, adminDb } from "@/lib/firebaseAdmin";
import { sanitizeString } from "@/lib/security";
import { logger } from "@/lib/logger";
import type { AIProviderId } from "@/ai/platform/catalog";
import { sealJsonPayload, openJsonPayload } from "./crypto";
import type {
  ProviderMode,
  SafeProviderConnection,
  StoredProviderSecret,
} from "./types";

type ProviderConnectionDoc = {
  userId: string;
  providerId: AIProviderId;
  enabled: boolean;
  verified: boolean;
  defaultModel?: string;
  mode: ProviderMode;
  lastTestedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  lastError?: string | null;
  secret?: StoredProviderSecret["secret"] | null;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
};

function docId(userId: string, providerId: AIProviderId): string {
  return `${userId}_${providerId}`;
}

function serializeConnection(doc: ProviderConnectionDoc): SafeProviderConnection {
  const toIso = (value: unknown): string | null => {
    if (!value) return null;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (typeof value === "string") return value;
    return null;
  };

  return {
    providerId: doc.providerId,
    enabled: doc.enabled === true,
    verified: doc.verified === true,
    defaultModel: doc.defaultModel,
    mode: doc.mode || "hybrid",
    lastTestedAt: toIso(doc.lastTestedAt),
    lastError: doc.lastError || null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function encryptProviderSecret(payload: Record<string, unknown>) {
  return sealJsonPayload(payload);
}

export function decryptProviderSecret<T extends Record<string, unknown>>(secret: StoredProviderSecret["secret"]): T {
  return openJsonPayload<T>(secret);
}

export async function upsertProviderConnection(input: {
  userId: string;
  providerId: AIProviderId;
  apiKey: string;
  enabled?: boolean;
  verified?: boolean;
  defaultModel?: string;
  mode?: ProviderMode;
}): Promise<SafeProviderConnection> {
  const id = docId(input.userId, input.providerId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const secret = encryptProviderSecret({
    apiKey: sanitizeString(input.apiKey, 4096),
    providerId: input.providerId,
    userId: input.userId,
  });

  const doc: ProviderConnectionDoc = {
    userId: input.userId,
    providerId: input.providerId,
    enabled: input.enabled ?? true,
    verified: input.verified ?? false,
    defaultModel: input.defaultModel ? sanitizeString(input.defaultModel, 120) : undefined,
    mode: input.mode || "hybrid",
    lastTestedAt: null,
    lastError: null,
    secret,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection("aiProviderConnections").doc(id).set(doc, { merge: true });
  logger.info("[AI BYOK] Provider connection saved", {
    userId: input.userId,
    providerId: input.providerId,
    enabled: doc.enabled,
    verified: doc.verified,
  });

  return serializeConnection(doc);
}

export async function getProviderConnection(userId: string, providerId: AIProviderId): Promise<SafeProviderConnection | null> {
  const snapshot = await adminDb.collection("aiProviderConnections").doc(docId(userId, providerId)).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() as ProviderConnectionDoc;
  return serializeConnection({
    ...data,
    userId: typeof data.userId === "string" ? data.userId : userId,
    providerId: data.providerId || providerId,
  });
}

export async function listProviderConnections(userId: string): Promise<SafeProviderConnection[]> {
  const snapshot = await adminDb
    .collection("aiProviderConnections")
    .where("userId", "==", userId)
    .get();

  return snapshot.docs.map((doc) => serializeConnection(doc.data() as ProviderConnectionDoc));
}

export async function removeProviderConnection(userId: string, providerId: AIProviderId): Promise<void> {
  await adminDb.collection("aiProviderConnections").doc(docId(userId, providerId)).delete();
  logger.info("[AI BYOK] Provider connection removed", { userId, providerId });
}

export async function toggleProviderConnection(
  userId: string,
  providerId: AIProviderId,
  enabled: boolean
): Promise<SafeProviderConnection | null> {
  const ref = adminDb.collection("aiProviderConnections").doc(docId(userId, providerId));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;

  await ref.set({
    enabled,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const next = await ref.get();
  return next.exists ? serializeConnection(next.data() as ProviderConnectionDoc) : null;
}

export async function testProviderConnection(
  userId: string,
  providerId: AIProviderId
): Promise<{ ok: boolean; connection: SafeProviderConnection | null; message: string }> {
  const ref = adminDb.collection("aiProviderConnections").doc(docId(userId, providerId));
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return { ok: false, connection: null, message: "Provider connection not found" };
  }

  const data = snapshot.data() as ProviderConnectionDoc;
  if (!data.secret) {
    return { ok: false, connection: serializeConnection(data), message: "Provider secret missing" };
  }

  let message = "Secret stored securely";
  let ok = true;

  try {
    const secret = openJsonPayload<{ apiKey?: string }>(data.secret);
    if (!secret.apiKey) {
      throw new Error("API key missing");
    }

    if (providerId === "openai" || providerId === "xai" || providerId === "mistral") {
      const baseURL =
        providerId === "openai"
          ? "https://api.openai.com/v1"
          : providerId === "xai"
            ? process.env.XAI_BASE_URL || "https://api.x.ai/v1"
            : process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";

      const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
        headers: {
          Authorization: `Bearer ${secret.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Provider rejected the key (${response.status})`);
      }

      message = "Connection verified";
    } else if (providerId === "elevenlabs") {
      const baseURL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";
      const response = await fetch(`${baseURL.replace(/\/$/, "")}/user`, {
        headers: {
          "xi-api-key": secret.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Provider rejected the key (${response.status})`);
      }

      message = "Connection verified";
    } else {
      message = "Manual verification required for this provider";
    }

    ok = true;
    await ref.set({
      verified: true,
      lastTestedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    ok = false;
    message = error instanceof Error ? error.message : String(error);
    await ref.set({
      verified: false,
      lastTestedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: message,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const next = await ref.get();
  return {
    ok,
    connection: next.exists ? serializeConnection(next.data() as ProviderConnectionDoc) : null,
    message,
  };
}

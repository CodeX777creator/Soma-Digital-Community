import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

export interface AdminAuditInput {
  adminId: string;
  adminEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  await adminDb.collection("adminAuditLogs").add({
    adminId: input.adminId,
    adminEmail: input.adminEmail || null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata || {},
    requestId: input.requestId || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

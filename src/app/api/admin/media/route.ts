import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import {
  ADMIN_MEDIA_LIMITS,
  getAdminMediaKind,
  normalizeAdminUsageContext,
  sanitizeAdminFileName,
  type AdminMediaAsset,
} from "@/admin/media";
import { writeAdminAuditLog } from "@/admin/audit";

const ALLOWED_TYPES = [
  /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i,
  /^video\/(mp4|webm|quicktime)$/i,
  /^audio\/(mpeg|mp3|wav|ogg|webm|mp4)$/i,
  /^application\/pdf$/i,
  /^application\/zip$/i,
  /^application\/x-zip-compressed$/i,
  /^application\/vnd\./i,
  /^text\/(plain|markdown|csv)$/i,
];

function isAllowedType(contentType: string) {
  return ALLOWED_TYPES.some((pattern) => pattern.test(contentType));
}

function contextRoot(context: string, entityId?: string | null) {
  const safeEntity = sanitizeAdminFileName(entityId || "unlinked");
  if (context === "academy") return `academy/courses/${safeEntity}`;
  if (context === "events") return `events/${safeEntity}`;
  if (context === "marketplace") return `marketplace/products/${safeEntity}`;
  if (context === "settings") return "admin/settings";
  if (context === "users") return `admin/users/${safeEntity}`;
  if (context === "notifications") return "admin/notifications";
  return "admin/uploads";
}

function publicDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function listMedia(req: Request) {
  const url = new URL(req.url);
  const usageContext = url.searchParams.get("usageContext");
  const kind = url.searchParams.get("kind");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "40"), 1), 100);

  let query: FirebaseFirestore.Query = adminDb
    .collection("adminMediaAssets")
    .where("status", "==", "ready");

  if (usageContext) query = query.where("usageContext", "==", normalizeAdminUsageContext(usageContext));
  if (kind && kind !== "all") query = query.where("kind", "==", kind);

  const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
  const assets = snap.docs.map((doc) => ({ assetId: doc.id, ...doc.data() }));
  return apiResponse({ assets });
}

async function createExternalMedia(req: Request, adminId: string) {
  const body = await req.json();
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) {
    return apiError("Enter a valid media URL.", { status: 400, code: "INVALID_MEDIA_URL" });
  }

  const usageContext = normalizeAdminUsageContext(body.usageContext);
  const assetRef = adminDb.collection("adminMediaAssets").doc();
  const kind = getAdminMediaKind(String(body.contentType || ""), url);
  const asset: AdminMediaAsset = {
    assetId: assetRef.id,
    source: "external_url",
    kind,
    fileName: String(body.fileName || url.split("/").pop() || "External media").slice(0, 180),
    contentType: String(body.contentType || "text/uri-list"),
    sizeBytes: 0,
    width: null,
    height: null,
    durationSeconds: null,
    storagePath: null,
    downloadUrl: url,
    thumbnailUrl: kind === "image" ? url : null,
    altText: String(body.altText || ""),
    caption: String(body.caption || ""),
    usageContext,
    linkedEntityType: body.linkedEntityType || null,
    linkedEntityId: body.linkedEntityId || null,
    createdBy: adminId,
    status: "ready",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await assetRef.set(asset);
  await writeAdminAuditLog({
    adminId,
    action: "admin_media_external_url_added",
    entityType: "adminMediaAsset",
    entityId: assetRef.id,
    metadata: { usageContext, url },
  });

  return apiResponse({ asset }, { status: 201 });
}

async function uploadMedia(req: Request, adminId: string) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError("Choose a file to upload.", { status: 400, code: "MEDIA_FILE_REQUIRED" });
  }

  const usageContext = normalizeAdminUsageContext(form.get("usageContext"));
  const linkedEntityType = String(form.get("linkedEntityType") || "");
  const linkedEntityId = String(form.get("linkedEntityId") || "");
  const altText = String(form.get("altText") || "");
  const caption = String(form.get("caption") || "");
  const contentType = file.type || "application/octet-stream";
  const kind = getAdminMediaKind(contentType, file.name);

  if (!isAllowedType(contentType) && kind === "unknown") {
    return apiError("This file type is not supported for admin uploads.", { status: 400, code: "UPLOAD_UNSUPPORTED_TYPE" });
  }

  const maxSize = ADMIN_MEDIA_LIMITS[kind === "external" ? "unknown" : kind];
  if (file.size > maxSize) {
    return apiError(`This file is too large. Try a file under ${Math.round(maxSize / 1024 / 1024)}MB.`, {
      status: 400,
      code: "UPLOAD_TOO_LARGE",
    });
  }

  const assetRef = adminDb.collection("adminMediaAssets").doc();
  const safeName = sanitizeAdminFileName(file.name);
  const root = contextRoot(usageContext, linkedEntityId);
  const storagePath = `${root}/${assetRef.id}/${Date.now()}-${safeName}`;
  const token = crypto.randomUUID();
  const bucket = adminStorage.bucket();
  const buffer = Buffer.from(await file.arrayBuffer());

  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedBy: adminId,
        usageContext,
        linkedEntityType,
        linkedEntityId,
      },
    },
  });

  const downloadUrl = publicDownloadUrl(bucket.name, storagePath, token);
  const now = FieldValue.serverTimestamp();
  const asset: AdminMediaAsset = {
    assetId: assetRef.id,
    source: "upload",
    kind,
    fileName: file.name,
    contentType,
    sizeBytes: file.size,
    width: null,
    height: null,
    durationSeconds: null,
    storagePath,
    downloadUrl,
    thumbnailUrl: kind === "image" ? downloadUrl : null,
    altText,
    caption,
    usageContext,
    linkedEntityType: linkedEntityType || null,
    linkedEntityId: linkedEntityId || null,
    createdBy: adminId,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };

  await assetRef.set(asset);
  await writeAdminAuditLog({
    adminId,
    action: "admin_media_uploaded",
    entityType: "adminMediaAsset",
    entityId: assetRef.id,
    metadata: { usageContext, linkedEntityType, linkedEntityId, kind, sizeBytes: file.size, storagePath },
  });

  return apiResponse({ asset }, { status: 201 });
}

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");

  if (req.method === "GET") return listMedia(req);

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return uploadMedia(req, entitlements.uid);
  }

  return createExternalMedia(req, entitlements.uid);
});

export const GET = handler;
export const POST = handler;

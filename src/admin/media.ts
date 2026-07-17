export type AdminMediaSource = "upload" | "external_url";
export type AdminMediaStatus = "ready" | "processing" | "failed" | "deleted";
export type AdminMediaKind = "image" | "video" | "document" | "audio" | "external" | "unknown";

export type AdminMediaUsageContext =
  | "academy"
  | "events"
  | "marketplace"
  | "settings"
  | "users"
  | "notifications"
  | "general";

export interface AdminMediaAsset {
  assetId: string;
  source: AdminMediaSource;
  kind: AdminMediaKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  storagePath?: string | null;
  downloadUrl: string;
  thumbnailUrl?: string | null;
  altText?: string;
  caption?: string;
  usageContext: AdminMediaUsageContext;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  createdBy: string;
  status: AdminMediaStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminMediaExternalInput {
  url: string;
  fileName?: string;
  contentType?: string;
  altText?: string;
  caption?: string;
  usageContext?: AdminMediaUsageContext;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

export const ADMIN_MEDIA_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 750 * 1024 * 1024,
  document: 75 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  unknown: 50 * 1024 * 1024,
} as const;

export function getAdminMediaKind(contentType = "", fileName = ""): AdminMediaKind {
  const lowerType = contentType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerType.startsWith("image/")) return "image";
  if (lowerType.startsWith("video/")) return "video";
  if (lowerType.startsWith("audio/")) return "audio";
  if (
    lowerType === "application/pdf" ||
    lowerType.includes("document") ||
    lowerType.includes("presentation") ||
    lowerType.includes("spreadsheet") ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".ppt") ||
    lowerName.endsWith(".pptx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".zip")
  ) {
    return "document";
  }
  if (/^https?:\/\//i.test(fileName)) return "external";
  return "unknown";
}

export function sanitizeAdminFileName(fileName: string) {
  const base = fileName.trim() || "upload";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 140);
}

export function normalizeAdminUsageContext(value: unknown): AdminMediaUsageContext {
  const allowed: AdminMediaUsageContext[] = ["academy", "events", "marketplace", "settings", "users", "notifications", "general"];
  return allowed.includes(value as AdminMediaUsageContext) ? (value as AdminMediaUsageContext) : "general";
}

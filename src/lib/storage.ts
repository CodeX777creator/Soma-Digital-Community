import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { storage } from "@/lib/firebase";
import { createUploadError } from "@/lib/errors/domain";
import { logger } from "@/lib/logger";

const MAX_ASSET_SIZE = 50 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB for avatars

/**
 * Uploads an avatar image to Firebase Storage
 * @param file - The optimized avatar file
 * @param userId - The user's unique ID
 * @returns Promise resolving to the download URL
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<string> {
  if (!storage) throw createUploadError("UPLOAD_STORAGE_UNAVAILABLE", { message: "Storage not initialized", status: 503 });
  
  // Validate file size
  if (file.size > MAX_AVATAR_SIZE) {
    throw createUploadError("UPLOAD_TOO_LARGE", { message: `Avatar must be smaller than 5MB (current: ${(file.size / 1024 / 1024).toFixed(2)}MB)` });
  }
  
  const filename = `avatars/${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const avatarRef = ref(storage, filename);
  
  const uploadMetadata: UploadMetadata = {
    contentType: file.type,
    customMetadata: {
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    },
  };

  const task = uploadBytesResumable(avatarRef, file, uploadMetadata);

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        // Progress handling can be added here if needed
      },
      (error) => {
        logger.warn("Avatar upload failed", { error: error instanceof Error ? error.message : String(error), userId });
        reject(createUploadError("UPLOAD_INTERRUPTED", { message: error instanceof Error ? error.message : "Avatar upload interrupted" }));
      },
      () => resolve()
    );
  });

  return getDownloadURL(task.snapshot.ref);
}

const ALLOWED_ASSET_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["video/mp4", "mp4"],
  ["application/zip", "zip"],
  ["application/x-zip-compressed", "zip"],
  ["text/markdown", "md"],
  ["text/x-markdown", "md"],
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "mp4", "zip", "md"]);

export interface AssetUploadMetadata {
  uploadedBy: string;
  assetId: string;
}

export interface UploadAssetOptions {
  onProgress?: (progress: number, snapshot: UploadTaskSnapshot) => void;
}

function sanitizeFilename(filename: string) {
  return filename.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function getFileExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getAllowedContentType(file: File) {
  if (ALLOWED_ASSET_TYPES.has(file.type)) return file.type;

  const extension = getFileExtension(file.name);
  if (extension === "pdf") return "application/pdf";
  if (extension === "mp4") return "video/mp4";
  if (extension === "zip") return "application/zip";
  if (extension === "md") return "text/markdown";
  return file.type;
}

function validateAssetFile(file: File) {
  const extension = getFileExtension(file.name);
  const hasAllowedType = ALLOWED_ASSET_TYPES.has(file.type);
  const hasAllowedExtension = ALLOWED_EXTENSIONS.has(extension);

  if (!hasAllowedType && !hasAllowedExtension) {
    throw createUploadError("UPLOAD_UNSUPPORTED_TYPE", { message: "Only PDF, MP4, ZIP, and Markdown files are supported." });
  }

  if (file.size > MAX_ASSET_SIZE) {
    throw createUploadError("UPLOAD_TOO_LARGE", { message: "Asset files must be smaller than 50MB." });
  }
}

export async function uploadAsset(
  file: File,
  assetId: string,
  metadata: AssetUploadMetadata,
  options: UploadAssetOptions = {}
): Promise<string> {
  if (!storage) throw createUploadError("UPLOAD_STORAGE_UNAVAILABLE", { message: "Storage not initialized", status: 503 });
  if (!assetId || assetId !== metadata.assetId) {
    throw createUploadError("UPLOAD_STORAGE_PERMISSION_DENIED", { message: "A valid assetId is required before upload.", status: 403 });
  }

  if (!metadata.uploadedBy) {
    throw createUploadError("UPLOAD_STORAGE_PERMISSION_DENIED", { message: "uploadedBy metadata is required.", status: 403 });
  }

  validateAssetFile(file);

  const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
  const assetRef = ref(storage, `marketplace-assets/${assetId}/${filename}`);
  const uploadMetadata: UploadMetadata = {
    contentType: getAllowedContentType(file),
    customMetadata: {
      uploadedBy: metadata.uploadedBy,
      assetId,
    },
  };

  const task = uploadBytesResumable(assetRef, file, uploadMetadata);

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        options.onProgress?.(progress, snapshot);
      },
      (error) => reject(createUploadError("UPLOAD_INTERRUPTED", { message: error instanceof Error ? error.message : "Upload interrupted" })),
      () => resolve()
    );
  });

  return getDownloadURL(task.snapshot.ref);
}

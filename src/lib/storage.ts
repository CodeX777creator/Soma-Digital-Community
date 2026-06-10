import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { storage } from "@/lib/firebase";

const MAX_ASSET_SIZE = 50 * 1024 * 1024;

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
    throw new Error("Only PDF, MP4, ZIP, and Markdown files are supported.");
  }

  if (file.size > MAX_ASSET_SIZE) {
    throw new Error("Asset files must be smaller than 50MB.");
  }
}

export async function uploadAsset(
  file: File,
  assetId: string,
  metadata: AssetUploadMetadata,
  options: UploadAssetOptions = {}
): Promise<string> {
  if (!storage) throw new Error('Storage not initialized');
  if (!assetId || assetId !== metadata.assetId) {
    throw new Error("A valid assetId is required before upload.");
  }

  if (!metadata.uploadedBy) {
    throw new Error("uploadedBy metadata is required.");
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
      reject,
      () => resolve()
    );
  });

  return getDownloadURL(task.snapshot.ref);
}

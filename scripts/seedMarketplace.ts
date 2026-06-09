import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

type MarketplaceAssetType = "pdf" | "video" | "template" | "notion" | "link" | "code";
type MarketplaceAssetTier = "free" | "pro" | "elite";

interface MarketplaceAssetSeed {
  id: string;
  title: string;
  description: string;
  type: MarketplaceAssetType;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  assetUrl: string | null;
  storagePath: string | null;
  price: number;
  tier: MarketplaceAssetTier;
  isPublished: boolean;
}

interface MarketplaceAssetDocument extends MarketplaceAssetSeed {
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const ASSETS_PATH = path.join(process.cwd(), "scripts", "assets.json");
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), "scripts", "serviceAccountKey.json");
const COLLECTION_NAME = "marketplaceAssets";
const BATCH_LIMIT = 500;
const PROGRESS_INTERVAL = 50;
const VALID_TYPES: readonly MarketplaceAssetType[] = ["pdf", "video", "template", "notion", "link", "code"];
const VALID_TIERS: readonly MarketplaceAssetTier[] = ["free", "pro", "elite"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(filePath: string): unknown {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function readServiceAccount(): ServiceAccount {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    return JSON.parse(serviceAccountJson) as ServiceAccount;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || SERVICE_ACCOUNT_PATH;
  const serviceAccount = readJsonFile(serviceAccountPath);

  if (!isRecord(serviceAccount)) {
    throw new Error("Service account file must contain a JSON object.");
  }

  return serviceAccount as ServiceAccount;
}

function initializeAdmin(): void {
  if (getApps().length > 0) return;

  const serviceAccount = readServiceAccount();
  const projectId =
    serviceAccount.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("Set FIREBASE_PROJECT_ID or provide project_id in the service account.");
  }

  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });
}

function asString(value: unknown, field: string, id: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Asset "${id}" has an invalid "${field}" value.`);
  }

  return value;
}

function asNullableString(value: unknown, field: string, id: string): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value !== "string") {
    throw new Error(`Asset "${id}" has an invalid "${field}" value.`);
  }

  return value;
}

function asStringArray(value: unknown, field: string, id: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Asset "${id}" has an invalid "${field}" value.`);
  }

  return value;
}

function asNumber(value: unknown, field: string, id: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Asset "${id}" has an invalid "${field}" value.`);
  }

  return value;
}

function asBoolean(value: unknown, field: string, id: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Asset "${id}" has an invalid "${field}" value.`);
  }

  return value;
}

function asAssetType(value: unknown, id: string): MarketplaceAssetType {
  if (typeof value === "string" && VALID_TYPES.includes(value as MarketplaceAssetType)) {
    return value as MarketplaceAssetType;
  }

  throw new Error(`Asset "${id}" has an invalid "type" value.`);
}

function asAssetTier(value: unknown, id: string): MarketplaceAssetTier {
  if (typeof value === "string" && VALID_TIERS.includes(value as MarketplaceAssetTier)) {
    return value as MarketplaceAssetTier;
  }

  throw new Error(`Asset "${id}" has an invalid "tier" value.`);
}

function parseAsset(value: unknown, index: number): MarketplaceAssetSeed {
  if (!isRecord(value)) {
    throw new Error(`Asset at index ${index} must be an object.`);
  }

  const id = asString(value.id, "id", `index-${index}`);

  return {
    id,
    title: asString(value.title, "title", id),
    description: asString(value.description, "description", id),
    type: asAssetType(value.type, id),
    category: asString(value.category, "category", id),
    tags: asStringArray(value.tags, "tags", id),
    thumbnailUrl: asString(value.thumbnailUrl, "thumbnailUrl", id),
    assetUrl: asNullableString(value.assetUrl, "assetUrl", id),
    storagePath: asNullableString(value.storagePath, "storagePath", id),
    price: asNumber(value.price, "price", id),
    tier: asAssetTier(value.tier, id),
    isPublished: asBoolean(value.isPublished, "isPublished", id),
  };
}

function loadAssets(): MarketplaceAssetSeed[] {
  const rawAssets = readJsonFile(ASSETS_PATH);

  if (!Array.isArray(rawAssets)) {
    throw new Error("scripts/assets.json must contain an array of assets.");
  }

  const assets = rawAssets.map(parseAsset);
  const ids = new Set<string>();

  for (const asset of assets) {
    if (ids.has(asset.id)) {
      throw new Error(`Duplicate asset id in assets.json: ${asset.id}`);
    }
    ids.add(asset.id);
  }

  return assets;
}

function toFirestoreDocument(asset: MarketplaceAssetSeed): MarketplaceAssetDocument {
  const now = Timestamp.now();

  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    type: asset.type,
    category: asset.category,
    tags: asset.tags,
    thumbnailUrl: asset.thumbnailUrl,
    assetUrl: asset.assetUrl,
    storagePath: asset.storagePath,
    price: asset.price,
    tier: asset.tier,
    isPublished: asset.isPublished,
    createdAt: now,
    updatedAt: now,
  };
}

async function main(): Promise<void> {
  try {
    initializeAdmin();

    const db = getFirestore();
    const assets = loadAssets();
    const collectionRef = db.collection(COLLECTION_NAME);
    let seeded = 0;
    let skipped = 0;

    for (let start = 0; start < assets.length; start += BATCH_LIMIT) {
      const chunk = assets.slice(start, start + BATCH_LIMIT);
      const docRefs = chunk.map((asset) => collectionRef.doc(asset.id));
      const existingDocs = await db.getAll(...docRefs);
      const batch = db.batch();
      let writesInBatch = 0;

      existingDocs.forEach((snapshot, index) => {
        const asset = chunk[index];

        if (snapshot.exists) {
          skipped += 1;
          return;
        }

        batch.set(snapshot.ref, toFirestoreDocument(asset));
        writesInBatch += 1;
      });

      if (writesInBatch > 0) {
        await batch.commit();
      }

      seeded += writesInBatch;
      const processed = Math.min(start + chunk.length, assets.length);

      if (processed % PROGRESS_INTERVAL === 0 || processed === assets.length) {
        console.log(`Seeded ${processed}/${assets.length} assets...`);
      }
    }

    console.log(`Done. Created ${seeded} assets and skipped ${skipped} existing assets.`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to seed marketplace assets: ${message}`);
    process.exitCode = 1;
  }
}

void main();

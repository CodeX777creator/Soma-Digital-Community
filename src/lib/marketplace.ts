import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SubscriptionPlan } from "@/lib/entitlements";

export type MarketplaceAssetType = "pdf" | "video" | "template" | "notion" | "link" | "code" | "course";
export type MarketplaceAssetTier = "free" | "pro" | "elite";
export type MarketplaceLicenseType = "standard" | "mrr";
export type MarketplaceCommissionBase = "full_price" | "course_price";

export interface MarketplaceAsset {
  id: string;
  title: string;
  description: string;
  type: MarketplaceAssetType;
  category: string;
  tags: string[];
  thumbnailUrl: string;
  assetUrl: string | null;
  price: number;
  tier: MarketplaceAssetTier;
  licenseType: MarketplaceLicenseType;
  resaleEnabled: boolean;
  resalePrice: number;
  resellerCommissionType: "fixed" | "percentage";
  resellerCommissionValue: number;
  commissionBase: MarketplaceCommissionBase;
  courseValue: number;
  externalPlatform: string;
  externalAccessUrl: string;
  accessInstructions: string;
  websiteOnboardingInstructions: string;
  published: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MarketplaceAssetFilters {
  category?: string;
  tier?: MarketplaceAssetTier;
  tags?: string[];
  includeUnpublished?: boolean;
}

const COLLECTION = "marketplaceAssets";

function isLegacyCourseAsset(asset: MarketplaceAsset) {
  return asset.type === "course" || asset.category.toLowerCase() === "course" || asset.category.toLowerCase() === "courses";
}

function normalizeAsset(id: string, data: Record<string, any>): MarketplaceAsset {
  const rawTier = data.tier || "free";
  const tier: MarketplaceAssetTier =
    rawTier === "elite" || rawTier === "enterprise" ? "elite" : rawTier === "pro" ? "pro" : "free";
  return {
    id,
    title: data.title || "Untitled asset",
    description: data.description || "",
    type: data.type || "template",
    category: data.category || "General",
    tags: Array.isArray(data.tags) ? data.tags : [],
    thumbnailUrl: data.thumbnailUrl || "",
    assetUrl: data.assetUrl ?? null,
    price: typeof data.price === "number" ? data.price : 0,
    tier,
    licenseType: data.licenseType === "mrr" ? "mrr" : "standard",
    resaleEnabled: data.resaleEnabled === true,
    resalePrice: typeof data.resalePrice === "number" ? data.resalePrice : typeof data.price === "number" ? data.price : 0,
    resellerCommissionType: data.resellerCommissionType === "fixed" ? "fixed" : "percentage",
    resellerCommissionValue: typeof data.resellerCommissionValue === "number" ? data.resellerCommissionValue : 0,
    commissionBase: data.commissionBase === "course_price" ? "course_price" : "full_price",
    courseValue: typeof data.courseValue === "number" ? data.courseValue : typeof data.price === "number" ? data.price : 0,
    externalPlatform: typeof data.externalPlatform === "string" ? data.externalPlatform : "",
    externalAccessUrl: typeof data.externalAccessUrl === "string" ? data.externalAccessUrl : "",
    accessInstructions: typeof data.accessInstructions === "string" ? data.accessInstructions : "",
    websiteOnboardingInstructions: typeof data.websiteOnboardingInstructions === "string" ? data.websiteOnboardingInstructions : "",
    published: data.published !== false,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getMarketplaceAssets(filters: MarketplaceAssetFilters = {}): Promise<MarketplaceAsset[]> {
  if (!db) throw new Error('Database not initialized');
  const constraints = [];

  if (filters.category && filters.category !== "All Assets") {
    constraints.push(where("category", "==", filters.category));
  }

  if (filters.tier === "elite") {
    constraints.push(where("tier", "in", ["elite", "enterprise"]));
  } else if (filters.tier) {
    constraints.push(where("tier", "==", filters.tier));
  }

  if (filters.tags?.length) {
    constraints.push(where("tags", "array-contains-any", filters.tags.slice(0, 10)));
  }

  constraints.push(limit(100));

  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints));
  return snapshot.docs
    .map((assetDoc) => normalizeAsset(assetDoc.id, assetDoc.data()))
    .filter((asset) => filters.includeUnpublished || asset.published)
    .filter((asset) => !isLegacyCourseAsset(asset))
    .sort((a, b) => {
      const left = a.createdAt?.toMillis?.() ?? 0;
      const right = b.createdAt?.toMillis?.() ?? 0;
      return right - left;
    });
}

export async function getAssetById(assetId: string): Promise<MarketplaceAsset | null> {
  if (typeof window === "undefined") {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    const assetDoc = await adminDb.collection(COLLECTION).doc(assetId).get();
    if (!assetDoc.exists) return null;
    const asset = normalizeAsset(assetDoc.id, assetDoc.data() || {});
    return isLegacyCourseAsset(asset) ? null : asset;
  }

  if (!db) throw new Error('Database not initialized');
  const assetDoc = await getDoc(doc(db, COLLECTION, assetId));
  if (!assetDoc.exists()) return null;
  const asset = normalizeAsset(assetDoc.id, assetDoc.data());
  return isLegacyCourseAsset(asset) ? null : asset;
}

export function assetTierToSubscriptionPlan(tier: MarketplaceAssetTier): SubscriptionPlan {
  if (tier === "elite") return "elite";
  if (tier === "pro") return "pro";
  return "explorer";
}

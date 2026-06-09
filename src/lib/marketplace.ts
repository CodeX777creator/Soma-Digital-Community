import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SubscriptionPlan } from "@/lib/entitlements";

export type MarketplaceAssetType = "pdf" | "video" | "template" | "notion" | "link" | "code";
export type MarketplaceAssetTier = "free" | "pro" | "elite";

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
    published: data.published !== false,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function getMarketplaceAssets(filters: MarketplaceAssetFilters = {}): Promise<MarketplaceAsset[]> {
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

  if (!filters.includeUnpublished) {
    constraints.push(where("published", "==", true));
  }

  constraints.push(orderBy("createdAt", "desc"), limit(100));

  const snapshot = await getDocs(query(collection(db, COLLECTION), ...constraints));
  return snapshot.docs
    .map((assetDoc) => normalizeAsset(assetDoc.id, assetDoc.data()))
    .filter((asset) => filters.includeUnpublished || asset.published);
}

export async function getAssetById(assetId: string): Promise<MarketplaceAsset | null> {
  if (typeof window === "undefined") {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    const assetDoc = await adminDb.collection(COLLECTION).doc(assetId).get();
    if (!assetDoc.exists) return null;
    return normalizeAsset(assetDoc.id, assetDoc.data() || {});
  }

  const assetDoc = await getDoc(doc(db, COLLECTION, assetId));
  if (!assetDoc.exists()) return null;
  return normalizeAsset(assetDoc.id, assetDoc.data());
}

export function assetTierToSubscriptionPlan(tier: MarketplaceAssetTier): SubscriptionPlan {
  if (tier === "elite") return "elite";
  if (tier === "pro") return "pro";
  return "explorer";
}

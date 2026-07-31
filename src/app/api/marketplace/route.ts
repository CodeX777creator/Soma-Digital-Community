import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

function isCourse(data: Record<string, unknown>) {
  const type = String(data.type || "").toLowerCase();
  const category = String(data.category || "").toLowerCase();
  return type === "course" || category === "course" || category === "courses";
}

function normalize(id: string, data: Record<string, any>) {
  return {
    id,
    title: String(data.title || "Untitled product"),
    description: String(data.description || ""),
    type: data.type || "template",
    category: String(data.category || "General"),
    tags: Array.isArray(data.tags) ? data.tags : [],
    thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : "",
    assetUrl: null,
    price: typeof data.price === "number" ? data.price : 0,
    tier: data.tier === "elite" || data.tier === "enterprise" ? "elite" : data.tier === "pro" ? "pro" : "free",
    licenseType: data.licenseType === "mrr" ? "mrr" : "standard",
    resaleEnabled: data.resaleEnabled === true,
    resalePrice: typeof data.resalePrice === "number" ? data.resalePrice : data.price || 0,
    resellerCommissionType: data.resellerCommissionType === "fixed" ? "fixed" : "percentage",
    resellerCommissionValue: typeof data.resellerCommissionValue === "number" ? data.resellerCommissionValue : 0,
    commissionBase: "full_price",
    courseValue: 0,
    externalPlatform: typeof data.externalPlatform === "string" ? data.externalPlatform : "",
    externalAccessUrl: null,
    accessInstructions: typeof data.accessInstructions === "string" ? data.accessInstructions : "",
    websiteOnboardingInstructions: typeof data.websiteOnboardingInstructions === "string" ? data.websiteOnboardingInstructions : "",
    published: true,
    slug: typeof data.slug === "string" ? data.slug : id,
    deliveryType: data.type === "external_course" ? "external_access" : data.deliveryType || "download",
    pricingType: data.pricingType || (data.price > 0 ? "paid" : "free"),
    currency: typeof data.currency === "string" ? data.currency : "USD",
    externalAccessType: data.externalAccessType === "registration" || data.externalAccessType === "existing_account" ? data.externalAccessType : "manual_fulfillment",
    mrrPrice: typeof data.mrrPrice === "number" ? data.mrrPrice : null,
    mrrLicenseVersion: typeof data.mrrLicenseVersion === "string" ? data.mrrLicenseVersion : null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const tier = request.nextUrl.searchParams.get("tier");
  const snapshot = await adminDb.collection("marketplaceAssets").where("published", "==", true).limit(100).get();
  const assets = snapshot.docs
    .filter((doc) => !isCourse(doc.data()))
    .map((doc) => normalize(doc.id, doc.data()))
    .filter((asset) => !category || asset.category === category)
    .filter((asset) => !tier || asset.tier === tier || asset.tier === "free" || (tier === "elite" && asset.tier === "pro"));
  return NextResponse.json({ assets });
}

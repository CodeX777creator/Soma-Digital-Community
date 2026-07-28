import type { Metadata } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/site";
import { breadcrumbJsonLd, JsonLd, productJsonLd } from "@/lib/seo/structured-data";

type Props = { children: React.ReactNode; params: Promise<{ assetId: string }> };

async function getPublicAsset(assetId: string) {
  let snapshot = await adminDb.collection("marketplaceAssets").doc(assetId).get();
  if (!snapshot.exists) {
    const bySlug = await adminDb.collection("marketplaceAssets").where("slug", "==", assetId).limit(1).get();
    if (!bySlug.empty) snapshot = bySlug.docs[0];
  }
  if (!snapshot.exists) return null;
  const data = snapshot.data() || {};
  const legacyCourse = [data.type, data.category].some((value) => ["course", "courses"].includes(String(value || "").toLowerCase()));
  if (data.published === false || legacyCourse) return null;
  return { id: snapshot.id, ...data } as Record<string, any>;
}

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { assetId } = await params;
  const asset = await getPublicAsset(assetId);
  if (!asset) return buildPageMetadata({ title: "Product Not Found", description: "This Marketplace product is not available.", path: `/marketplace/${assetId}` });
  const slug = typeof asset.slug === "string" ? asset.slug : assetId;
  return buildPageMetadata({
    title: `${asset.title || "Marketplace Product"} | Marketplace`,
    description: asset.description || `Explore ${asset.title || "this digital business resource"} in the Soma Digital Community Marketplace.`,
    path: `/marketplace/${slug}`,
    image: asset.thumbnailUrl,
  });
}

export default async function MarketplaceAssetLayout({ children, params }: Props) {
  const { assetId } = await params;
  const asset = await getPublicAsset(assetId);
  if (!asset) return children;
  const slug = typeof asset.slug === "string" ? asset.slug : assetId;
  const priceCents = Number.isFinite(Number(asset.salePriceCents)) ? Number(asset.salePriceCents) : Number(asset.priceCents ?? asset.price ?? 0) * (asset.priceCents == null && asset.price != null ? 100 : 1);
  return <><JsonLd data={[productJsonLd({ name: asset.title || "Marketplace Product", description: asset.description || "A digital business resource from Soma Digital Community.", url: absoluteUrl(`/marketplace/${slug}`), image: asset.thumbnailUrl, priceCents, currency: asset.currency || "USD" }), breadcrumbJsonLd([{ name: "Marketplace", path: "/marketplace" }, { name: asset.title || "Product", path: `/marketplace/${slug}` }])]} />{children}</>;
}

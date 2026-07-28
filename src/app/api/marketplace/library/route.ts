import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

async function uidFromRequest(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try { return (await adminAuth.verifyIdToken(token, true)).uid; } catch { return null; }
}

export async function GET(request: NextRequest) {
  const userId = await uidFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let snapshot = await adminDb.collection("marketplacePurchases").where("userId", "==", userId).limit(100).get();
  if (snapshot.empty) snapshot = await adminDb.collection("assetPurchases").where("userId", "==", userId).limit(100).get();
  const items = await Promise.all(snapshot.docs.sort((a, b) => String(b.data().createdAt || "").localeCompare(String(a.data().createdAt || ""))).map(async (purchaseDoc) => {
    const purchase = purchaseDoc.data();
    const product = await adminDb.collection("marketplaceAssets").doc(String(purchase.productId || purchase.assetId || "")).get();
    return {
      id: purchaseDoc.id,
      purchaseId: purchase.purchaseId || purchaseDoc.id,
      productId: purchase.productId || purchase.assetId,
      title: product.data()?.title || purchase.assetTitle || "Marketplace product",
      thumbnailUrl: product.data()?.thumbnailUrl || "",
      licenseType: purchase.licenseType || "standard",
      status: purchase.status || "pending",
      createdAt: purchase.createdAt || null,
      paidAt: purchase.paidAt || null,
      deliveryType: product.data()?.deliveryType || "download",
      resellerLinkAvailable: purchase.licenseType === "mrr" && purchase.status === "paid",
    };
  }));
  return NextResponse.json({ items });
}

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  let snapshot = await adminDb.collection("marketplaceAssets").doc(assetId).get();
  if (!snapshot.exists) {
    const bySlug = await adminDb.collection("marketplaceAssets").where("slug", "==", assetId).limit(1).get();
    if (!bySlug.empty) snapshot = bySlug.docs[0];
  }
  if (!snapshot.exists || snapshot.data()?.published === false) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const data = snapshot.data() || {};
  const type = String(data.type || "").toLowerCase();
  const category = String(data.category || "").toLowerCase();
  if (type === "course" || category === "course" || category === "courses") return NextResponse.json({ error: "This course moved to Academy" }, { status: 404 });
  return NextResponse.json({ asset: { id: snapshot.id, ...data, assetUrl: null, externalAccessUrl: null } });
}

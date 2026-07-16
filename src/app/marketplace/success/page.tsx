"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/clientApi";
import { db } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/hooks/use-toast";

type Purchase = {
  id: string;
  assetId: string;
  assetTitle: string;
  status: string;
  licenseType: string;
  resaleRights: boolean;
  paystackReference?: string;
  provisioningStatus?: string;
};

export default function MarketplaceSuccessPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [access, setAccess] = useState<Record<string, any> | null>(null);
  const [resellerUrl, setResellerUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const assetId = searchParams.get("assetId") || "";

  useEffect(() => {
    let cancelled = false;
    async function loadSuccess() {
      if (!user?.uid || !assetId || !db) {
        setLoading(false);
        return;
      }

      try {
        const purchaseId = `${user.uid}_${assetId}`;
        const purchaseSnap = await getDoc(doc(db, "assetPurchases", purchaseId));
        const purchaseData = purchaseSnap.data() || {};
        const nextPurchase: Purchase = {
          id: purchaseId,
          assetId,
          assetTitle: purchaseData.assetTitle || "Marketplace purchase",
          status: purchaseData.status || "pending",
          licenseType: purchaseData.licenseType || "standard",
          resaleRights: purchaseData.resaleRights === true,
          paystackReference: purchaseData.paystackReference || "",
          provisioningStatus: purchaseData.provisioningStatus || "",
        };

        let accessPayload: Record<string, any> | null = null;
        if (nextPurchase.status === "paid") {
          const accessResponse = await authFetch("/api/marketplace/asset-access", {
            method: "POST",
            body: JSON.stringify({ assetId }),
          });
          accessPayload = await accessResponse.json();

          if (nextPurchase.resaleRights) {
            const linkResponse = await authFetch("/api/marketplace/reseller-link", {
              method: "POST",
              body: JSON.stringify({ assetId }),
            });
            const linkPayload = await linkResponse.json();
            if (linkResponse.ok) setResellerUrl(linkPayload.resellerLink?.url || "");
          }
        }

        if (!cancelled) {
          setPurchase(nextPurchase);
          setAccess(accessPayload);
        }
      } catch (error) {
        console.error("Unable to load purchase success:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSuccess();
    return () => {
      cancelled = true;
    };
  }, [assetId, user?.uid]);

  const copyResellerLink = async () => {
    await navigator.clipboard.writeText(resellerUrl);
    toast({ title: "Reseller link copied", description: resellerUrl });
  };

  const openProduct = () => {
    if (access?.assetUrl) window.open(access.assetUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="font-headline text-4xl font-bold tracking-tight">Purchase Status</h1>
            <p className="mt-2 text-muted-foreground">Your SDC purchase record controls access, fulfilment, and reseller attribution.</p>
          </div>

          {loading && (
            <GlassCard className="p-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
              Checking purchase
            </GlassCard>
          )}

          {!loading && !purchase && (
            <GlassCard className="p-10 text-center">
              <p className="font-semibold">We could not find this purchase yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">If you just paid, wait a moment for Paystack confirmation and refresh.</p>
            </GlassCard>
          )}

          {purchase && (
            <>
              <GlassCard className="p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-wider text-muted-foreground">Product</p>
                    <h2 className="mt-1 text-2xl font-bold">{purchase.assetTitle}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Status: {purchase.status}</p>
                    {purchase.paystackReference && <p className="mt-1 text-sm text-muted-foreground">Paystack reference: {purchase.paystackReference}</p>}
                    {purchase.provisioningStatus && <p className="mt-1 text-sm text-muted-foreground">Provisioning: {purchase.provisioningStatus.replace("_", " ")}</p>}
                  </div>
                  {purchase.status === "paid" && (
                    <div className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-200">
                      Confirmed
                    </div>
                  )}
                </div>
              </GlassCard>

              {purchase.status !== "paid" ? (
                <GlassCard className="p-6">
                  <p className="font-semibold">Payment confirmation is still pending.</p>
                  <p className="mt-2 text-sm text-muted-foreground">Your product will unlock automatically after Paystack sends the successful payment event.</p>
                </GlassCard>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-bold">Product Access</h3>
                    {access?.asset?.accessInstructions && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{access.asset.accessInstructions}</p>}
                    {access?.asset?.websiteOnboardingInstructions && (
                      <p className="mt-3 whitespace-pre-line rounded-md bg-white/5 p-3 text-sm text-white/75">{access.asset.websiteOnboardingInstructions}</p>
                    )}
                    <Button onClick={openProduct} className="mt-5 w-full">
                      <ExternalLink className="h-4 w-4" />
                      Open Product
                    </Button>
                  </GlassCard>

                  {purchase.resaleRights && (
                    <GlassCard className="p-6">
                      <h3 className="flex items-center gap-2 text-lg font-bold">
                        <ShieldCheck className="h-5 w-5 text-cyan-300" />
                        MRR Reseller Access
                      </h3>
                      <p className="mt-3 text-sm text-muted-foreground">Your reseller link is generated by SDC and keeps commissions attributed correctly.</p>
                      {resellerUrl && (
                        <p className="mt-3 break-all rounded-md bg-white/5 p-3 text-xs text-white/65">{resellerUrl}</p>
                      )}
                      <Button onClick={copyResellerLink} disabled={!resellerUrl} className="mt-5 w-full" variant="ghost">
                        <Copy className="h-4 w-4" />
                        Copy Reseller Link
                      </Button>
                      <Button asChild variant="link" className="mt-2 w-full text-cyan-300">
                        <Link href="/reseller">Open Reseller Dashboard</Link>
                      </Button>
                    </GlassCard>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

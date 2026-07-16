"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck, ShoppingBag } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { PromoRedeemCard } from "@/components/promos/PromoRedeemCard";
import { app } from "@/lib/firebase";
import { getAssetById, type MarketplaceAsset } from "@/lib/marketplace";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/hooks/use-toast";

const MRR_LICENSE_VERSION = "sdc-mrr-v1";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

export default function MarketplaceAssetDetailPage() {
  const params = useParams<{ assetId: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [asset, setAsset] = useState<MarketplaceAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [referrerName, setReferrerName] = useState("");

  const assetId = params.assetId;
  const resellerSlug = searchParams.get("ref") || "";
  const isMrr = asset?.licenseType === "mrr" && asset.resaleEnabled;

  useEffect(() => {
    let cancelled = false;
    async function loadAsset() {
      setLoading(true);
      try {
        const nextAsset = await getAssetById(assetId);
        if (!cancelled) setAsset(nextAsset);
      } catch (error) {
        console.error("Unable to load marketplace product:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAsset();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    async function loadReferrer() {
      if (!resellerSlug || !assetId) return;
      try {
        const response = await fetch(`/api/marketplace/reseller-ref?assetId=${encodeURIComponent(assetId)}&slug=${encodeURIComponent(resellerSlug)}`);
        const payload = await response.json();
        if (!cancelled) setReferrerName(payload.reseller?.name || "");
      } catch {
        if (!cancelled) setReferrerName("");
      }
    }
    loadReferrer();
    return () => {
      cancelled = true;
    };
  }, [assetId, resellerSlug]);

  const included = useMemo(() => {
    const items = ["Protected SDC purchase record", "Product access after verified payment"];
    if (asset?.externalPlatform) items.push(`${asset.externalPlatform} access instructions`);
    if (asset?.websiteOnboardingInstructions) items.push("Website onboarding instructions");
    if (isMrr) items.push("Personal SDC reseller link", "Reseller dashboard and commission tracking");
    return items;
  }, [asset, isMrr]);

  const startCheckout = async () => {
    if (!asset || !user?.uid) {
      toast({ title: "Sign in required", description: "Please sign in before purchasing." });
      return;
    }

    if (isMrr && !licenseAccepted) {
      toast({ title: "License agreement required", description: "Accept the MRR license terms to continue." });
      return;
    }

    setCheckoutLoading(true);
    try {
      const functions = getFunctions(app);
      const createPurchase = httpsCallable(functions, "createPaystackAssetPurchase");
      const result = await createPurchase({
        assetId: asset.id,
        userId: user.uid,
        resellerSlug: resellerSlug || undefined,
        mrrLicenseAccepted: isMrr ? true : undefined,
        mrrLicenseVersion: isMrr ? MRR_LICENSE_VERSION : undefined,
      });
      const data = result.data as { authorizationUrl?: string | null; status?: string; message?: string };
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      toast({ title: data.status === "already_owned" ? "Already owned" : "Purchase ready", description: data.message || asset.title });
    } catch (error) {
      toast({ title: "Checkout unavailable", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const copyCurrentLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied" });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <GlassCard className="p-10 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
            Loading product
          </GlassCard>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  if (!asset) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <GlassCard className="p-10 text-center">
            <p className="font-semibold">Product not found.</p>
            <Button asChild className="mt-5"><Link href="/marketplace">Back to Marketplace</Link></Button>
          </GlassCard>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
              {asset.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.thumbnailUrl} alt="" className="aspect-[16/8] w-full object-cover" />
              ) : (
                <div className="aspect-[16/8] bg-white/5" />
              )}
            </div>

            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge className="bg-white/10 text-white">{asset.type}</Badge>
                <Badge className={isMrr ? "bg-cyan-400 text-black" : "bg-white/10 text-white"}>{isMrr ? "MRR License" : "Standard License"}</Badge>
                {asset.externalPlatform && <Badge className="bg-primary/20 text-primary">{asset.externalPlatform}</Badge>}
              </div>
              <h1 className="font-headline text-4xl font-bold tracking-tight md:text-5xl">{asset.title}</h1>
              <p className="mt-4 text-lg text-muted-foreground">{asset.description}</p>
              {referrerName && (
                <p className="mt-4 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  Referred by {referrerName}. Commission attribution will be handled by SDC after payment.
                </p>
              )}
            </div>

            <GlassCard className="p-6">
              <h2 className="text-xl font-bold">What's Included</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {included.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-white/75">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </div>
                ))}
              </div>
            </GlassCard>

            {isMrr && (
              <GlassCard className="p-6">
                <h2 className="text-xl font-bold">MRR Benefits</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {["Resell through your SDC link", "Track buyers and sales", "Earn configured commissions", "Keep product delivery centralized in SDC"].map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm text-white/75">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      {item}
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            <GlassCard className="p-6">
              <h2 className="text-xl font-bold">License Terms Summary</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>Products may only be resold through SDC.</li>
                <li>Redistribution of raw product files is prohibited.</li>
                <li>Buyers may not claim authorship or ownership of the original content.</li>
                <li>All resale activity must comply with platform licensing terms.</li>
              </ul>
            </GlassCard>
          </section>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <PromoRedeemCard
              compact
              source="marketplace_checkout"
              title="Have a product unlock code?"
              description="Apply eligible launch, product, or marketplace campaign benefits before checkout."
              className="mb-4"
            />
            <GlassCard className="p-6">
              <p className="text-sm uppercase tracking-wider text-muted-foreground">Price</p>
              <p className="mt-2 font-headline text-4xl font-bold">{money(asset.price)}</p>
              {asset.commissionBase === "course_price" && (
                <p className="mt-2 text-xs text-muted-foreground">Commission is calculated on product value: {money(asset.courseValue)}</p>
              )}
              {asset.websiteOnboardingInstructions && (
                <p className="mt-3 rounded-md bg-white/5 p-3 text-sm text-white/70">Includes website setup/onboarding as part of the bundle.</p>
              )}
              {asset.externalPlatform && (
                <p className="mt-3 text-sm text-muted-foreground">Access is fulfilled after SDC payment verification via {asset.externalPlatform}.</p>
              )}

              {isMrr && (
                <label className="mt-5 flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={licenseAccepted}
                    onChange={(event) => setLicenseAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>I accept the SDC MRR License Agreement and understand resale must happen through SDC.</span>
                </label>
              )}

              <Button onClick={startCheckout} disabled={checkoutLoading || (isMrr && !licenseAccepted)} className="mt-5 h-12 w-full text-base font-bold">
                {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
                Buy Now
              </Button>
              <Button onClick={copyCurrentLink} variant="ghost" className="mt-3 w-full border border-white/10 bg-white/5">
                <Copy className="h-4 w-4" />
                Copy Page Link
              </Button>
              <Button asChild variant="link" className="mt-2 w-full text-cyan-300">
                <Link href={`/marketplace/success?assetId=${encodeURIComponent(asset.id)}`}>
                  <ExternalLink className="h-4 w-4" />
                  Already purchased? Open purchases
                </Link>
              </Button>
            </GlassCard>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

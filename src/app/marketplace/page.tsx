"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Star, Filter, ShoppingBag, Zap, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { authFetch } from "@/lib/clientApi";
import { app } from "@/lib/firebase";
import { getMarketplaceAssets, MarketplaceAsset } from "@/lib/marketplace";
import { useToast } from "@/hooks/use-toast";
import { getFunctions, httpsCallable } from "firebase/functions";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function MarketplacePage() {
  const [filter, setFilter] = useState("All Assets");
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setLoading(true);
      setLoadError("");
      try {
        const fetchedAssets = await getMarketplaceAssets();
        if (!cancelled) setAssets(fetchedAssets);
      } catch (err) {
        console.error("Failed to load marketplace assets:", err);
        if (!cancelled) setLoadError("Unable to load marketplace assets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    return ["All Assets", ...Array.from(new Set(assets.map((asset) => asset.category))).sort()];
  }, [assets]);

  const visibleAssets = assets.filter((asset) => {
    const matchesCategory = filter === "All Assets" || asset.category === filter;
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query
      || asset.title.toLowerCase().includes(query)
      || asset.category.toLowerCase().includes(query)
      || asset.description.toLowerCase().includes(query)
      || asset.tags.some((tag) => tag.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const handlePurchase = async (asset: MarketplaceAsset) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to purchase courses.' });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const resellerSlug = params.get('ref') || undefined;
    const functions = getFunctions(app);
    const createPurchase = httpsCallable(functions, 'createPaystackAssetPurchase');
    const result = await createPurchase({
      assetId: asset.id,
      userId: user.uid,
      resellerSlug,
    });
    const data = result.data as { authorizationUrl?: string | null; status?: string; message?: string };

    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
      return;
    }

    toast({
      title: data.status === 'already_owned' ? 'Already owned' : 'Purchase ready',
      description: data.message || asset.title,
    });
  };

  const handleAcquire = async (asset: MarketplaceAsset) => {
    const assetId = asset.id;
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to access assets.' });
      return;
    }

    try {
      const response = await authFetch('/api/marketplace/asset-access', {
        method: 'POST',
        body: JSON.stringify({ assetId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to access asset');
      }

      if (payload.assetUrl) {
        window.open(payload.assetUrl, '_blank', 'noopener,noreferrer');
      }

      if (payload.purchase?.resaleRights && !payload.resellerLink?.url) {
        try {
          await authFetch('/api/marketplace/reseller-link', {
            method: 'POST',
            body: JSON.stringify({ assetId }),
          });
        } catch (linkError) {
          console.warn("Unable to prepare reseller link:", linkError);
        }
      }

      toast({ title: 'Access granted', description: payload.asset?.title || 'Opening resource.' });
    } catch (err) {
      if (asset.price > 0) {
        try {
          await handlePurchase(asset);
          return;
        } catch (purchaseError) {
          toast({
            title: 'Checkout unavailable',
            description: purchaseError instanceof Error ? purchaseError.message : 'Unable to start purchase.',
          });
          return;
        }
      }

      toast({ title: 'Access denied', description: err instanceof Error ? err.message : 'Upgrade required' });
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex flex-col gap-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-4xl font-bold font-headline tracking-tight">Resource Center</h1>
            <p className="text-muted-foreground mt-2">Premium tools, templates, and high-performance resources to grow your business.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search assets..." className="pl-10 bg-white/5 border-white/10" />
            </div>
            <Button onClick={() => { setFilter("All Assets"); setSearchTerm(""); }} variant="ghost" className="border border-white/10 bg-white/5">
              <Filter className="w-4 h-4 mr-2" /> Reset
            </Button>
          </div>
        </div>

        <div className="flex gap-4 pb-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <Badge 
              key={cat} 
              onClick={() => setFilter(cat)}
              variant={filter === cat ? "default" : "outline"} 
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer whitespace-nowrap transition-all ${filter === cat ? "bg-primary blue-glow border-none" : "border-white/10 hover:bg-white/5"}`}
            >
              {cat}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <AssetSkeleton key={index} />
          ))}
          {!loading && loadError && (
            <GlassCard className="p-10 text-center text-muted-foreground sm:col-span-2 lg:col-span-3">
              {loadError}
            </GlassCard>
          )}
          {!loading && !loadError && visibleAssets.map(asset => (
            <div key={asset.id} className="relative group h-full">
              <AssetCard asset={asset} onAcquire={() => handleAcquire(asset)} />
            </div>
          ))}
          {!loading && !loadError && visibleAssets.length === 0 && (
            <GlassCard className="p-10 text-center text-muted-foreground sm:col-span-2 lg:col-span-3">
              No resources match that search.
            </GlassCard>
          )}
        </div>

        {/* Premium Upgrade CTA Section */}
        <div className="mt-12 p-8 md:p-16 rounded-[3rem] bg-gradient-to-r from-[#0d1117] via-primary/10 to-[#0d1117] border border-primary/20 relative overflow-hidden flex flex-col items-center text-center gap-8 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full opacity-5 bg-grid-white/[0.02] bg-repeat" />
          <div className="relative z-10 space-y-4 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">Elite Tools. <br /><span className="text-gradient">Unlimited Access.</span></h2>
            <p className="text-muted-foreground text-lg">
              Unlock every single high-converting asset in the Resource Center, from advanced sales funnels to AI business systems.
            </p>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row gap-4">
             <Button asChild className="h-16 px-12 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow transition-all active:scale-95">
               <Link href="/dashboard?upgrade=pro">Upgrade to Pro</Link>
             </Button>
             <Button asChild variant="ghost" className="h-16 px-12 rounded-full border border-white/10 hover:bg-white/5 text-xl font-semibold backdrop-blur-sm">
               <Link href="/#pricing">View Membership Plans</Link>
             </Button>
          </div>
        </div>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}

function formatPrice(price: number, tier: MarketplaceAsset["tier"]) {
  if (price === 0 && tier === "free") return "Free";
  if (price === 0) return `Free for ${tier === "elite" ? "Elite" : "Pro"}`;
  return `$${price}`;
}

function AssetSkeleton() {
  return (
    <GlassCard className="p-0 overflow-hidden h-full border-white/5">
      <div className="aspect-[16/10] bg-white/5 animate-pulse" />
      <div className="p-6 space-y-5">
        <div className="h-6 bg-white/5 rounded-lg animate-pulse" />
        <div className="h-4 bg-white/5 rounded-lg animate-pulse w-2/3" />
        <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
      </div>
    </GlassCard>
  );
}

function AssetCard({ asset, onAcquire }: { asset: MarketplaceAsset; onAcquire: () => void }) {
  const isPremium = asset.tier !== "free";
  const isLocked = asset.tier !== "free";

  return (
    <GlassCard className="p-0 overflow-hidden flex flex-col group h-full border-white/5 hover:border-white/20 transition-all duration-500">
      <div className="aspect-[16/10] relative overflow-hidden">
        <img 
          src={asset.thumbnailUrl} 
          alt={asset.title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
        />
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {isPremium && (
            <Badge className="bg-primary text-[9px] font-bold py-1 px-3 border-none blue-glow uppercase tracking-wider">PREMIUM</Badge>
          )}
          {asset.licenseType === "mrr" && asset.resaleEnabled && (
            <Badge className="bg-cyan-400 text-black text-[9px] font-bold py-1 px-3 border-none uppercase tracking-wider">MRR</Badge>
          )}
          <Badge className="bg-black/60 backdrop-blur-md text-[9px] font-bold py-1 px-3 border-none uppercase tracking-wider">{asset.category}</Badge>
        </div>
        {isLocked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Lock className="w-8 h-8 text-white/50" />
          </div>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col gap-6">
        <div className="flex-1">
          <h3 className="font-bold text-xl leading-tight group-hover:text-primary transition-colors">{asset.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{asset.description}</p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-500 uppercase">
              <Star className="w-3.5 h-3.5 fill-yellow-500" /> {asset.tier}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase">
              <Download className="w-3.5 h-3.5" /> {asset.type}
            </div>
            {asset.licenseType === "mrr" && asset.resaleEnabled && (
              <div className="text-[10px] font-bold text-cyan-300 uppercase">
                Resell Rights
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between pt-5 border-t border-white/5">
           <span className="text-2xl font-bold font-headline">{formatPrice(asset.price, asset.tier)}</span>
           <Button onClick={onAcquire} size="icon" variant="ghost" className="rounded-2xl w-12 h-12 bg-white/5 border border-white/5 hover:bg-primary hover:text-white hover:border-primary transition-all group/btn blue-glow">
             <ShoppingBag className="w-5 h-5" />
           </Button>
        </div>
      </div>
    </GlassCard>
  );
}

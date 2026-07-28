"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag } from "lucide-react";
import { authFetch, parseApiError } from "@/lib/clientApi";

type LibraryItem = { id: string; productId: string; title: string; thumbnailUrl: string; licenseType: string; status: string; deliveryType: string; resellerLinkAvailable: boolean };

export default function MarketplaceLibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void authFetch("/api/marketplace/library").then(async (response) => {
      if (!response.ok) throw await parseApiError(response, "Unable to load your Marketplace library.");
      const payload = await response.json();
      setItems(Array.isArray(payload.items) ? payload.items : []);
    }).catch((err) => setError(err instanceof Error ? err.message : "Unable to load your Marketplace library.")).finally(() => setLoading(false));
  }, []);
  return <ProtectedRoute><AppLayout><div className="mx-auto max-w-6xl space-y-6"><div><p className="text-xs uppercase tracking-[0.24em] text-primary">Marketplace</p><h1 className="mt-2 text-4xl font-bold">Your library</h1><p className="mt-2 text-muted-foreground">Access your purchased products, licenses, and reseller rights in one place.</p></div>{loading && <GlassCard className="p-10 text-center"><Loader2 className="mx-auto animate-spin" /></GlassCard>}{error && <GlassCard className="p-6 text-red-300">{error}</GlassCard>}{!loading && !error && items.length === 0 && <GlassCard className="p-10 text-center"><ShoppingBag className="mx-auto mb-3 text-primary" /><p className="font-semibold">Your Marketplace library is empty.</p><Button asChild className="mt-5"><Link href="/marketplace">Explore products</Link></Button></GlassCard>}{!loading && !error && items.length > 0 && <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map((item) => <GlassCard key={item.id} className="overflow-hidden p-0"><div className="aspect-[16/9] bg-white/5">{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />}</div><div className="space-y-3 p-5"><h2 className="font-semibold">{item.title}</h2><p className="text-sm text-muted-foreground">{item.licenseType.toUpperCase()} license · {item.status}</p><Button asChild className="w-full"><Link href={`/marketplace/${item.productId}`}>Open product</Link></Button>{item.resellerLinkAvailable && <Button asChild variant="ghost" className="w-full"><Link href="/reseller">Open reseller dashboard</Link></Button>}</div></GlassCard>)}</div>}</div></AppLayout></ProtectedRoute>;
}

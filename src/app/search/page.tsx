"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Post, postService } from "@/lib/db";
import { getMarketplaceAssets, MarketplaceAsset } from "@/lib/marketplace";

export default function SearchPage() {
  const [term, setTerm] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);

  useEffect(() => postService.subscribeToPosts(setPosts, 50), []);

  useEffect(() => {
    let cancelled = false;
    getMarketplaceAssets()
      .then((fetchedAssets) => {
        if (!cancelled) setAssets(fetchedAssets);
      })
      .catch((error) => console.error("Failed to load marketplace search assets:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    const postResults = posts
      .filter((post) => post.content.toLowerCase().includes(q) || post.authorName.toLowerCase().includes(q))
      .map((post) => ({ title: post.authorName, detail: post.content, href: "/community", type: "Community" }));
    const assetResults = assets
      .filter((asset) => asset.title.toLowerCase().includes(q) || asset.category.toLowerCase().includes(q) || asset.description.toLowerCase().includes(q))
      .map((asset) => ({ title: asset.title, detail: asset.description || asset.category, href: "/marketplace", type: "Resource" }));
    return [...postResults, ...assetResults].slice(0, 20);
  }, [assets, posts, term]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-700">
          <div>
            <h1 className="text-4xl font-bold font-headline">Search</h1>
            <p className="text-muted-foreground mt-2">Search community posts and resource center assets.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search Soma..." className="h-14 pl-12 bg-white/5 border-white/10" />
          </div>
          <div className="flex flex-col gap-3">
            {term && results.length === 0 && <GlassCard className="p-8 text-muted-foreground">No results found.</GlassCard>}
            {results.map((result, index) => (
              <Link key={`${result.href}-${index}`} href={result.href}>
                <GlassCard className="p-5 hover:border-primary/30 transition-colors">
                  <p className="text-[10px] uppercase tracking-widest text-primary font-bold">{result.type}</p>
                  <h2 className="font-bold mt-1">{result.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{result.detail}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

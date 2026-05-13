"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, Star, Filter, ShoppingBag, Zap, Lock } from "lucide-react";
import { PremiumLock } from "@/components/premium/PremiumLock";
import { useState } from "react";

const assets = [
  {
    id: 1,
    title: "Venture-Scale SaaS Funnel",
    category: "Funnels",
    price: "Free",
    rating: 4.9,
    downloads: 1240,
    image: "https://picsum.photos/seed/funnel1/600/400",
    isPremium: false
  },
  {
    id: 2,
    title: "Obsidian Creator Kit",
    category: "Branding",
    price: "$49",
    rating: 5.0,
    downloads: 856,
    image: "https://picsum.photos/seed/branding1/600/400",
    isPremium: true,
    isLocked: true
  },
  {
    id: 3,
    title: "AI Agency Operating System",
    category: "Notion",
    price: "Free for Pro",
    rating: 4.8,
    downloads: 3200,
    image: "https://picsum.photos/seed/notion1/600/400",
    isPremium: true,
    isLocked: true
  },
  {
    id: 4,
    title: "High-Ticket Sales Script",
    category: "Copywriting",
    price: "$29",
    rating: 4.7,
    downloads: 540,
    image: "https://picsum.photos/seed/copy1/600/400",
    isPremium: false
  },
  {
    id: 5,
    title: "Mastermind Strategy Deck",
    category: "Strategy",
    price: "$197",
    rating: 5.0,
    downloads: 124,
    image: "https://picsum.photos/seed/deck/600/400",
    isPremium: true,
    isLocked: true
  },
  {
    id: 6,
    title: "Web3 Launch Checklist",
    category: "Web3",
    price: "Free",
    rating: 4.6,
    downloads: 2100,
    image: "https://picsum.photos/seed/web3/600/400",
    isPremium: false
  }
];

export default function MarketplacePage() {
  const [filter, setFilter] = useState("All Assets");

  return (
    <AppLayout>
      <div className="flex flex-col gap-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="text-4xl font-bold font-headline tracking-tight">The Vault</h1>
            <p className="text-muted-foreground mt-2">Premium resources, templates, and high-performance assets to scale your digital ecosystem.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search assets..." className="pl-10 bg-white/5 border-white/10" />
            </div>
            <Button variant="ghost" className="border border-white/10 bg-white/5">
              <Filter className="w-4 h-4 mr-2" /> Filter
            </Button>
          </div>
        </div>

        <div className="flex gap-4 pb-2 overflow-x-auto no-scrollbar">
          {["All Assets", "Funnels", "Branding", "Copywriting", "Notion", "Strategy", "Prompts"].map((cat) => (
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
          {assets.map(asset => (
            <div key={asset.id} className="relative group h-full">
              {asset.isLocked ? (
                <PremiumLock 
                  feature={asset.title} 
                  description={`This ${asset.category} kit contains proprietary logic and templates. Upgrade to Pro for instant access.`}
                >
                  <AssetCard asset={asset} />
                </PremiumLock>
              ) : (
                <AssetCard asset={asset} />
              )}
            </div>
          ))}
        </div>

        {/* Premium Upgrade CTA Section */}
        <div className="mt-12 p-8 md:p-16 rounded-[3rem] bg-gradient-to-r from-[#0d1117] via-primary/10 to-[#0d1117] border border-primary/20 relative overflow-hidden flex flex-col items-center text-center gap-8 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full opacity-5 bg-[url('https://picsum.photos/seed/grid/800/800')] bg-repeat" />
          <div className="relative z-10 space-y-4 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">Elite Resources. <br /><span className="text-gradient">Unlimited Access.</span></h2>
            <p className="text-muted-foreground text-lg">
              Unlock every single high-converting asset in The Vault, from advanced SaaS funnels to proprietary AI agency operating systems.
            </p>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row gap-4">
             <Button className="h-16 px-12 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow transition-all active:scale-95">Upgrade to Pro</Button>
             <Button variant="ghost" className="h-16 px-12 rounded-full border border-white/10 hover:bg-white/5 text-xl font-semibold backdrop-blur-sm">View Membership Plans</Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function AssetCard({ asset }: { asset: any }) {
  return (
    <GlassCard className="p-0 overflow-hidden flex flex-col group h-full border-white/5 hover:border-white/20 transition-all duration-500">
      <div className="aspect-[16/10] relative overflow-hidden">
        <img 
          src={asset.image} 
          alt={asset.title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
        />
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {asset.isPremium && (
            <Badge className="bg-primary text-[9px] font-bold py-1 px-3 border-none blue-glow uppercase tracking-wider">PREMIUM</Badge>
          )}
          <Badge className="bg-black/60 backdrop-blur-md text-[9px] font-bold py-1 px-3 border-none uppercase tracking-wider">{asset.category}</Badge>
        </div>
        {asset.isLocked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Lock className="w-8 h-8 text-white/50" />
          </div>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col gap-6">
        <div className="flex-1">
          <h3 className="font-bold text-xl leading-tight group-hover:text-primary transition-colors">{asset.title}</h3>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-500 uppercase">
              <Star className="w-3.5 h-3.5 fill-yellow-500" /> {asset.rating}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase">
              <Download className="w-3.5 h-3.5" /> {asset.downloads}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-5 border-t border-white/5">
           <span className="text-2xl font-bold font-headline">{asset.price}</span>
           <Button size="icon" variant="ghost" className="rounded-2xl w-12 h-12 bg-white/5 border border-white/5 hover:bg-primary hover:text-white hover:border-primary transition-all group/btn blue-glow">
             <ShoppingBag className="w-5 h-5" />
           </Button>
        </div>
      </div>
    </GlassCard>
  );
}

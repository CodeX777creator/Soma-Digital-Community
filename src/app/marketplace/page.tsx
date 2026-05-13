"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Star, Filter, ShoppingBag, Zap } from "lucide-react";

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
    isPremium: true
  },
  {
    id: 3,
    title: "AI Agency Operating System",
    category: "Notion",
    price: "Free for Premium",
    rating: 4.8,
    downloads: 3200,
    image: "https://picsum.photos/seed/notion1/600/400",
    isPremium: true
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
  }
];

export default function MarketplacePage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
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
          {["All Assets", "Funnels", "Branding", "Copywriting", "Notion", "Templates", "Prompts"].map((cat, i) => (
            <Badge 
              key={cat} 
              variant={i === 0 ? "default" : "outline"} 
              className={`px-4 py-2 text-sm cursor-pointer whitespace-nowrap ${i === 0 ? "bg-primary" : "border-white/10 hover:bg-white/5"}`}
            >
              {cat}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {assets.map(asset => (
            <GlassCard key={asset.id} className="p-0 overflow-hidden flex flex-col group h-full">
              <div className="aspect-[4/3] relative overflow-hidden">
                <img 
                  src={asset.image} 
                  alt={asset.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute top-3 right-3 flex flex-col gap-2">
                  {asset.isPremium && (
                    <Badge className="bg-primary text-[10px] font-bold py-0.5 border-none blue-glow">PREMIUM</Badge>
                  )}
                  <Badge className="bg-black/60 backdrop-blur-md text-[10px] font-bold py-0.5 border-none">{asset.category}</Badge>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="flex-1">
                  <h3 className="font-bold text-lg leading-snug group-hover:text-primary transition-colors">{asset.title}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1 text-xs font-bold text-yellow-400">
                      <Star className="w-3 h-3 fill-yellow-400" /> {asset.rating}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Download className="w-3 h-3" /> {asset.downloads}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                   <span className="text-xl font-bold font-headline">{asset.price}</span>
                   <Button size="icon" variant="ghost" className="rounded-full bg-white/5 border border-white/5 hover:bg-primary hover:text-white hover:border-primary transition-all group/btn">
                     <ShoppingBag className="w-4 h-4" />
                   </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Premium Banner */}
        <div className="mt-12 p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-r from-primary to-accent relative overflow-hidden text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl">
          <div className="absolute top-0 right-0 w-full h-full opacity-10">
             <div className="w-full h-full bg-[url('https://picsum.photos/seed/texture/800/400')] bg-cover" />
          </div>
          <div className="relative z-10 flex-1 flex flex-col gap-4">
            <h2 className="text-3xl md:text-5xl font-bold font-headline leading-tight">Unlock the Entire Ecosystem</h2>
            <p className="text-white/80 text-lg max-w-xl">
              Get every single template, funnel, and strategy in The Vault for free when you upgrade to a Premium Legacy Membership.
            </p>
          </div>
          <div className="relative z-10 flex flex-col gap-3">
             <Button className="h-14 px-10 rounded-full bg-white text-primary hover:bg-white/90 text-lg font-bold">Upgrade Now</Button>
             <p className="text-xs text-white/60 text-center font-medium">Starting at $97 / month</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

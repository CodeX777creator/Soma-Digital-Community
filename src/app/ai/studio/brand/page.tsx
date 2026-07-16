"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Building2, Save, ShieldCheck, Sparkles } from "lucide-react";

type BrandContext = {
  brandName: string;
  businessContext: string;
  targetAudience: string;
  brandVoice: string;
  offer: string;
  prohibitedClaims: string;
};

const DEFAULT_BRAND_CONTEXT: BrandContext = {
  brandName: "",
  businessContext: "",
  targetAudience: "",
  brandVoice: "Premium, direct, helpful, calm, and practical.",
  offer: "",
  prohibitedClaims: "",
};

const STORAGE_KEY = "sdc.aiStudio.brandContext";

export default function StudioBrandPage() {
  const { toast } = useToast();
  const [brand, setBrand] = useState<BrandContext>(DEFAULT_BRAND_CONTEXT);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setBrand({ ...DEFAULT_BRAND_CONTEXT, ...(JSON.parse(raw) as Partial<BrandContext>) });
    } catch {
      setBrand(DEFAULT_BRAND_CONTEXT);
    }
  }, []);

  const update = <K extends keyof BrandContext>(key: K, value: BrandContext[K]) => {
    setBrand((current) => ({ ...current, [key]: value }));
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
    toast({
      title: "Brand context saved",
      description: "Your browser will use this context when you start from the Brand workspace.",
    });
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <section className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#4F9DFF]/25 bg-[#4F9DFF]/10 px-3 py-1 text-xs text-[#BFC6D4]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#4F9DFF]" />
              Brand Workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">Brand voice and business context</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#BFC6D4]">
              Save the plain-English context Soma should remember when creating content for your audience.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <GlassCard className="p-5">
              <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand name</label>
                    <Input value={brand.brandName} onChange={(event) => update("brandName", event.target.value)} placeholder="Soma Digital Community" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Core offer</label>
                    <Input value={brand.offer} onChange={(event) => update("offer", event.target.value)} placeholder="Certification, community, AI tools, templates..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Business context</label>
                  <Textarea rows={5} value={brand.businessContext} onChange={(event) => update("businessContext", event.target.value)} placeholder="What the business does, who it helps, and the outcome it creates." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target audience</label>
                  <Textarea rows={4} value={brand.targetAudience} onChange={(event) => update("targetAudience", event.target.value)} placeholder="Who Soma should write for, their pain points, and what matters to them." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Brand voice</label>
                  <Textarea rows={4} value={brand.brandVoice} onChange={(event) => update("brandVoice", event.target.value)} placeholder="Premium, direct, helpful..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Claims to avoid</label>
                  <Textarea rows={3} value={brand.prohibitedClaims} onChange={(event) => update("prohibitedClaims", event.target.value)} placeholder="Anything Soma should not promise or imply." />
                </div>
                <Button type="submit" className="rounded-2xl">
                  <Save className="h-4 w-4" />
                  Save brand context
                </Button>
              </form>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-white">Use this in Studio</h2>
              <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">
                This sends the saved brand context into AI Studio so the composer starts with your business, audience, and voice already loaded.
              </p>
              <Button asChild className="mt-5 w-full rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]">
                <Link
                  href={`/ai/studio?${new URLSearchParams({
                    source: "brand",
                    brandName: brand.brandName,
                    brandVoice: brand.brandVoice,
                    targetAudience: brand.targetAudience,
                    businessContext: [brand.businessContext, brand.offer, brand.prohibitedClaims ? `Avoid: ${brand.prohibitedClaims}` : ""].filter(Boolean).join("\n"),
                  }).toString()}`}
                >
                  Start with brand context
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="mt-3 w-full rounded-2xl">
                <Link href="/ai/studio">
                  <Sparkles className="h-4 w-4" />
                  Open command center
                </Link>
              </Button>
            </GlassCard>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

"use client";

import { Calculator, DollarSign } from "lucide-react";
import {
  CREATOR_CREDIT_USD_VALUE,
  estimateAudioCreatorCredits,
  estimateImageCreatorCredits,
  estimateVideoCreatorCredits,
} from "@/lib/ai-credit-estimates";

const rules = [
  {
    title: "Text generation",
    unit: "Token-based",
    userCopy: "Users see an estimated Creator Credit cost before generation.",
    internal: "Input tokens + reserved output tokens. Actual provider usage reconciles after completion.",
    example: "Estimated 3 credits, charged 2 credits, 1 returned.",
  },
  {
    title: "Image generation",
    unit: "Per image",
    userCopy: `${estimateImageCreatorCredits(1)} credits per standard image, higher for premium model classes.`,
    internal: "imageCount × model class / provider pricing × SDC multiplier.",
    example: "1 social image = 10 credits.",
  },
  {
    title: "Video draft",
    unit: "Flat planning cost",
    userCopy: `${estimateVideoCreatorCredits({ mode: "draft" })} credits for script, scenes, captions, thumbnail direction, and scheduler plan.`,
    internal: "Drafts are content planning, not playable renders.",
    example: "Video draft = 20 credits.",
  },
  {
    title: "Full video render",
    unit: "Per second",
    userCopy: "10 credits per rendered second.",
    internal: "durationSeconds × video model rate. Expensive/specialized models can be Elite-only.",
    example: `30-second render = ${estimateVideoCreatorCredits({ mode: "render", durationSeconds: 30 })} credits.`,
  },
  {
    title: "Audio render",
    unit: "Per second with character safety",
    userCopy: "2 credits per rendered second.",
    internal: "durationSeconds × audio rate, with character count retained for provider-cost analysis.",
    example: `30-second voiceover = ${estimateAudioCreatorCredits({ durationSeconds: 30 })} credits.`,
  },
  {
    title: "Cached/reused content",
    unit: "Skipped ledger",
    userCopy: "0 credits.",
    internal: "Writes a skipped ledger entry with cache metadata for honest analytics.",
    example: "Reused saved result = 0 credits.",
  },
];

export default function AdminAIPricingPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-cyan-200" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Credit Pricing</p>
            <h1 className="mt-2 text-2xl font-semibold">Usage-based Creator Credit policy</h1>
            <p className="mt-2 text-sm text-white/55">1 Creator Credit has a retail baseline of ${CREATOR_CREDIT_USD_VALUE.toFixed(2)} before bundle discounts.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rules.map((rule) => (
          <article key={rule.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">{rule.title}</h2>
              <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">{rule.unit}</span>
            </div>
            <p className="text-sm leading-6 text-white/70">{rule.userCopy}</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/50">
              {rule.internal}
            </div>
            <p className="mt-3 text-sm font-medium text-cyan-100">{rule.example}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Calculator className="h-4 w-4 text-cyan-200" />
          Tier Access Rule
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-black/20 p-4">
            <p className="font-semibold">Explorer</p>
            <p className="mt-2 text-sm text-white/55">Standard models only. No included credits. Pay-as-you-go Creator Credits.</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="font-semibold">Pro</p>
            <p className="mt-2 text-sm text-white/55">Standard, advanced, and premium models. Monthly credits and better rates.</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="font-semibold">Elite</p>
            <p className="mt-2 text-sm text-white/55">All classes including specialized video and high-risk premium workflows.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

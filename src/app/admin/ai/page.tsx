"use client";

import Link from "next/link";
import { Activity, Bot, Database, DollarSign, Route, Settings } from "lucide-react";

const sections = [
  {
    href: "/admin/ai/models",
    title: "Model Catalog",
    description: "Sync and inspect Vercel AI Gateway models, capabilities, pricing, and tier access.",
    icon: Database,
  },
  {
    href: "/admin/ai/model-routing",
    title: "Model Routing",
    description: "Assign default and fallback models to SDC features without changing code.",
    icon: Route,
  },
  {
    href: "/admin/ai/pricing",
    title: "Credit Pricing",
    description: "Review token, image, video-second, and audio-second pricing rules.",
    icon: DollarSign,
  },
  {
    href: "/admin/ai/usage",
    title: "Gateway Usage",
    description: "Monitor request volume, failed generations, credits charged, refunds, and expensive models.",
    icon: Activity,
  },
];

export default function AdminAIGatewayPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#101827] to-[#080A12] p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-200">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">AI Gateway</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Model, pricing, and usage control center</h1>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">
          Manage the dynamic model registry, feature routing, Creator Credit pricing, and operational health from one admin surface.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.06]"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-cyan-200">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">{section.description}</p>
            </Link>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Settings className="h-4 w-4 text-cyan-200" />
          Target Gateway Flow
        </div>
        <div className="mt-4 grid gap-3 text-sm text-white/65 md:grid-cols-7">
          {["Sync models", "Assign feature", "Estimate credits", "Reserve", "Execute", "Reconcile", "Ledger"].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-center">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

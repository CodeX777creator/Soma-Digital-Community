"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ImageIcon,
  Layers3,
  Menu,
  MessageSquare,
  PenTool,
  Play,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/providers/AuthProvider";
import { getPlanLabel, getUpgradeTarget } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/useUserStore";
import { faqJsonLd, JsonLd } from "@/lib/seo/structured-data";

const ecosystem = [
  {
    id: "create",
    title: "Create",
    eyebrow: "AI Studio",
    description: "Generate captions, blogs, scripts, images, voice, and video from one calm creative workspace.",
    href: "/ai/studio",
    icon: PenTool,
    preview: ["Caption system", "Image studio", "Video campaigns"],
  },
  {
    id: "plan",
    title: "Plan",
    eyebrow: "AI Mentor",
    description: "Turn goals into a business roadmap, action plans, and context your AI Mentor remembers.",
    href: "/mentor",
    icon: Bot,
    preview: ["Roadmap", "Goals", "Next actions"],
  },
  {
    id: "publish",
    title: "Publish",
    eyebrow: "Scheduler",
    description: "Connect social accounts, prepare media-first posts, schedule campaigns, and track publishing health.",
    href: "/social/calendar?mode=scheduler",
    icon: CalendarClock,
    preview: ["TikTok", "Instagram", "LinkedIn"],
  },
  {
    id: "learn",
    title: "Learn",
    eyebrow: "Academy",
    description: "Follow premium certification courses with lessons, activities, quizzes, live classes, and certificates.",
    href: "/academy",
    icon: BookOpen,
    preview: ["Lessons", "Quizzes", "Certificates"],
  },
  {
    id: "monetize",
    title: "Monetize",
    eyebrow: "Marketplace",
    description: "Package products, find resources, use reseller tools, and build income streams from your skills.",
    href: "/marketplace",
    icon: Store,
    preview: ["Products", "Reseller tools", "Insights"],
  },
];

const planCards = [
  {
    name: "Explorer",
    price: "Start free",
    description: "Access the operating system and buy Creator Credits when you are ready to generate.",
    features: ["AI Studio access", "Creator Credit top-ups", "Community and Academy browsing"],
    cta: "Start Building",
    href: "/open?plan=explorer",
  },
  {
    name: "Pro",
    price: "$97/mo",
    description: "Included monthly credits and stronger execution tools for active creators and entrepreneurs.",
    features: ["Included monthly credits", "AI Mentor workflows", "Scheduler and business tools"],
    cta: "Start Pro",
    href: "/open?plan=pro",
    featured: true,
  },
  {
    name: "Elite",
    price: "$297/mo",
    description: "Higher credit allocation, priority workflows, and premium operating intelligence.",
    features: ["Higher included credits", "Priority AI workflows", "Advanced analytics and execution"],
    cta: "Start Elite",
    href: "/open?plan=elite",
  },
];

function ProductPreview() {
  const [active, setActive] = useState("studio");

  const tabs = [
    { id: "studio", label: "AI Studio", icon: Sparkles },
    { id: "roadmap", label: "Roadmap", icon: Route },
    { id: "publish", label: "Publish", icon: CalendarClock },
  ];

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[#111827]/70 p-4 shadow-[0_32px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      <div className="rounded-[22px] border border-white/[0.06] bg-[#090B13]/90 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[#BFC6D4]">
            <Search className="h-3.5 w-3.5" />
            Ask SDC to create a 7-day launch plan
          </div>
          <div className="hidden rounded-full bg-gradient-to-r from-[#5B5FFF] to-[#8B5CF6] px-3 py-2 text-xs font-medium text-white sm:block">
            Preview
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[16px] border px-3 py-3 text-xs font-medium transition",
                  active === tab.id
                    ? "border-[#8B5CF6]/40 bg-[#5B5FFF]/18 text-white shadow-[0_14px_40px_rgba(91,95,255,0.2)]"
                    : "border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:bg-white/[0.06]"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-3">
            <div className="rounded-[18px] border border-white/[0.06] bg-[#151A2E]/80 p-4 transition hover:-translate-y-0.5 hover:border-[#4F9DFF]/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">AI prompt</p>
                  <h3 className="mt-2 text-lg font-medium text-white">Create today&apos;s campaign</h3>
                </div>
                <Button size="icon" className="rounded-[16px] bg-gradient-to-r from-[#5B5FFF] to-[#8B5CF6]">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  ["Generate image", ImageIcon],
                  ["Write caption", MessageSquare],
                  ["Make video", Video],
                ].map(([label, Icon]) => (
                  <div key={String(label)} className="flex items-center gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2 text-xs text-[#BFC6D4]">
                    <Icon className="h-3.5 w-3.5 text-[#4F9DFF]" />
                    {String(label)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.06] bg-[#151A2E]/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Roadmap</p>
                  <p className="mt-2 font-medium text-white">Foundation Builder</p>
                </div>
                <span className="text-sm text-[#BFC6D4]">62%</span>
              </div>
              <Progress value={62} className="mt-4 h-2" />
              <div className="mt-4 space-y-2">
                {["Clarify offer", "Create content engine", "Schedule first campaign"].map((item, index) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-[#BFC6D4]">
                    <CheckCircle2 className={cn("h-4 w-4", index < 2 ? "text-[#22C55E]" : "text-[#7E8799]")} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[18px] border border-white/[0.06] bg-[#151A2E]/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Scheduled</p>
              <div className="mt-4 rounded-[16px] bg-gradient-to-br from-[#1E293B] to-[#111827] p-3">
                <div className="mb-3 h-24 rounded-[14px] bg-[radial-gradient(circle_at_30%_20%,rgba(79,157,255,.42),transparent_34%),radial-gradient(circle_at_80%_30%,rgba(139,92,246,.42),transparent_35%),#090B13]" />
                <div className="flex items-center justify-between text-xs text-[#BFC6D4]">
                  <span>TikTok · 7:30 PM</span>
                  <span className="rounded-full bg-[#22C55E]/15 px-2 py-1 text-[#86EFAC]">Ready</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-white/[0.06] bg-[#151A2E]/70 p-4">
                <CreditCard className="h-4 w-4 text-[#4F9DFF]" />
                <p className="mt-4 text-2xl font-semibold text-white">Credits</p>
                <p className="mt-1 text-xs text-[#BFC6D4]">Clear, non-technical AI usage</p>
              </div>
              <div className="rounded-[18px] border border-white/[0.06] bg-[#151A2E]/70 p-4">
                <Users className="h-4 w-4 text-[#8B5CF6]" />
                <p className="mt-4 text-2xl font-semibold text-white">Community</p>
                <p className="mt-1 text-xs text-[#BFC6D4]">Network, learn, and grow</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, userData, loading } = useAuth();
  const { tier } = useUserStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isOnboarded = userData?.onboardingComplete === true;
  const primaryHref = user ? (isOnboarded ? "/dashboard" : "/open") : "/open";
  const primaryLabel = user ? (isOnboarded ? "Go to Dashboard" : "Continue Setup") : "Start Building";
  const upgradeTarget = getUpgradeTarget(tier);
  const planLabel = getPlanLabel(tier);

  const navLinks = useMemo(() => {
    if (!user) {
      return [
        { label: "Product", href: "#product" },
        { label: "Academy", href: "/academy" },
        { label: "Community", href: "/community" },
        { label: "Pricing", href: "#pricing" },
      ];
    }

    if (!isOnboarded) {
      return [{ label: "Continue Setup", href: "/open" }];
    }

    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Studio", href: "/ai/studio" },
      { label: "Mentor", href: "/mentor" },
      { label: "Scheduler", href: "/social/calendar?mode=scheduler" },
      { label: "Profile", href: "/profile" },
    ];
  }, [isOnboarded, user]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#090B13] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(79,157,255,0.18),transparent_32%),radial-gradient(circle_at_78%_10%,rgba(139,92,246,0.16),transparent_34%),linear-gradient(180deg,rgba(17,24,39,0.55),rgba(9,11,19,0))]" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#090B13]/82 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Soma Digital Community home">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-[0_18px_50px_rgba(91,95,255,0.32)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight">SDC</p>
              <p className="text-xs text-[#BFC6D4]">Soma Digital Community</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 lg:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full px-4 py-2 text-sm text-[#BFC6D4] transition hover:bg-white/[0.06] hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {user && isOnboarded ? (
              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-[#BFC6D4]">
                {planLabel}
              </span>
            ) : null}
            {!user ? (
              <Button asChild variant="ghost" className="rounded-full text-[#BFC6D4] hover:text-white">
                <Link href="/login">Login</Link>
              </Button>
            ) : null}
            {user && isOnboarded && upgradeTarget ? (
              <Button asChild className="rounded-full bg-white/[0.06] text-white hover:bg-white/[0.1]">
                <Link href={`/dashboard?upgrade=${upgradeTarget}`}>Upgrade</Link>
              </Button>
            ) : null}
            <Button asChild className="rounded-full bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-5 font-medium shadow-[0_18px_50px_rgba(91,95,255,0.32)]">
              <Link href={primaryHref}>
                {loading ? "Loading" : primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-[16px] text-white lg:hidden"
            onClick={() => setMobileOpen((current) => !current)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/[0.06] bg-[#090B13] px-5 py-5 lg:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[#BFC6D4]">
                  {link.label}
                </Link>
              ))}
              {!user && (
                <Link href="/login" onClick={() => setMobileOpen(false)} className="rounded-[16px] border border-white/[0.06] px-4 py-3 text-[#BFC6D4]">
                  Login
                </Link>
              )}
              <Link href={primaryHref} onClick={() => setMobileOpen(false)} className="rounded-[16px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-4 py-3 text-center font-medium text-white">
                {primaryLabel}
              </Link>
            </div>
          </div>
        )}
      </header>

      <section id="hero" className="relative z-10 mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#BFC6D4]">
            <Sparkles className="h-4 w-4 text-[#8B5CF6]" />
            Soma Digital Community
          </div>
          <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-7xl">
            The AI Operating System for Digital Entrepreneurs
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#BFC6D4]">
            Create content, plan your business, publish consistently, learn new skills, and monetize your expertise from one premium AI-first command center.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-14 rounded-[18px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-7 text-base font-medium shadow-[0_22px_70px_rgba(91,95,255,0.34)]">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-14 rounded-[18px] border-white/[0.08] bg-white/[0.03] px-7 text-base text-white hover:bg-white/[0.08]">
              <Link href="#product">
                <Play className="h-4 w-4" />
                See How It Works
              </Link>
            </Button>
          </div>
          <div className="mt-8 grid max-w-2xl gap-3 text-sm text-[#BFC6D4] sm:grid-cols-3">
            {["AI Studio", "Business roadmap", "Creator Credits"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <ProductPreview />
      </section>

      <section id="product" className="relative z-10 border-y border-white/[0.06] bg-[#111827]/45 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8B5CF6]">One connected ecosystem</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Workflows, not isolated tools.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#BFC6D4]">
              SDC connects creation, guidance, publishing, learning, and monetization so every action moves your business forward.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {ecosystem.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group rounded-[18px] border border-white/[0.08] bg-[#151A2E]/76 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition duration-200 hover:-translate-y-1 hover:border-[#8B5CF6]/35 hover:bg-[#1A2140]/86"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-[0_16px_45px_rgba(91,95,255,0.26)]">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#7E8799]">{item.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-medium text-white">{item.title}</h3>
                  <p className="mt-3 min-h-24 text-sm leading-6 text-[#BFC6D4]">{item.description}</p>
                  <div className="mt-5 space-y-2">
                    {item.preview.map((preview) => (
                      <div key={preview} className="flex items-center gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2 text-xs text-[#BFC6D4]">
                        <Layers3 className="h-3.5 w-3.5 text-[#4F9DFF]" />
                        {preview}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-2 text-sm text-[#BFC6D4] group-hover:text-white">
                    Open workflow
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[28px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_28px_90px_rgba(0,0,0,0.32)]">
            <CreditCard className="h-7 w-7 text-[#4F9DFF]" />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white">Creator Credits make AI simple.</h2>
            <p className="mt-4 text-base leading-7 text-[#BFC6D4]">
              Explorer users can enter AI Studio and buy Creator Credits when they are ready to generate. Pro and Elite include monthly credits, with the same optional top-up bundles across plans.
            </p>
            <div className="mt-6 rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-5">
              <p className="text-sm font-medium text-white">No token math. No provider pricing. Just Creator Credits.</p>
              <p className="mt-2 text-sm text-[#BFC6D4]">The product explains what users can create, not what providers charge behind the scenes.</p>
            </div>
          </div>

          <div id="pricing" className="grid gap-4 md:grid-cols-3">
            {planCards.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "rounded-[22px] border bg-[#151A2E]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]",
                  plan.featured ? "border-[#8B5CF6]/40 ring-1 ring-[#8B5CF6]/25" : "border-white/[0.08]"
                )}
              >
                {plan.featured && (
                  <span className="mb-4 inline-flex rounded-full bg-[#8B5CF6]/20 px-3 py-1 text-xs font-medium text-[#DDD6FE]">
                    Popular
                  </span>
                )}
                <h3 className="text-xl font-medium text-white">{plan.name}</h3>
                <p className="mt-2 text-2xl font-semibold text-white">{plan.price}</p>
                <p className="mt-3 min-h-20 text-sm leading-6 text-[#BFC6D4]">{plan.description}</p>
                <div className="mt-5 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-2 text-sm text-[#BFC6D4]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" />
                      {feature}
                    </div>
                  ))}
                </div>
                <Button asChild className={cn("mt-6 h-11 w-full rounded-[16px]", plan.featured ? "bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]" : "bg-white/[0.06] hover:bg-white/[0.1]")}>
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="answers" className="relative z-10 border-y border-white/[0.06] bg-[#111827]/35 py-20">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8B5CF6]">Straight answers</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Everything you need to know before you start.</h2>
            <p className="mt-4 text-base leading-7 text-[#BFC6D4]">Clear answers about the SDC operating system, its tools, and how each part supports your next business move.</p>
          </div>
          <div className="mt-10 divide-y divide-white/[0.08] rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 px-6">
            {[
              ["What is Soma Digital Community?", "Soma Digital Community is an AI operating system for digital entrepreneurs. It brings content creation, business planning, publishing, learning, community, and monetization into one connected workspace."],
              ["Who is SDC for?", "SDC is for entrepreneurs, creators, freelancers, business owners, and beginners who want practical structure for building and growing a digital business without needing to be technical."],
              ["What can AI Studio create?", "AI Studio helps you create business content such as social posts, scripts, blogs, emails, images, videos, voiceovers, and campaigns from guided workflows."],
              ["How does AI Mentor work?", "AI Mentor turns your goals, business context, and audience into practical guidance, roadmaps, action plans, and next steps that help you keep moving."],
              ["What are Creator Credits?", "Creator Credits are SDC's usage balance for AI generations. Explorer members can buy credits when needed, while Pro and Elite plans include monthly credits and optional top-ups."],
              ["What is the difference between Academy and Marketplace?", "Academy is for structured courses, lessons, certifications, and course-related reseller rights. Marketplace is for digital products such as templates, tools, downloads, and external resources."],
              ["How does the Scheduler publish content?", "Scheduler sends prepared content to connected social accounts using platform-specific settings for captions, media, privacy, disclosure, timing, and publishing permissions."],
            ].map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold text-white marker:hidden">
                  {question}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#7E8799] transition group-open:rotate-90" />
                </summary>
                <p className="max-w-3xl pt-3 text-sm leading-7 text-[#BFC6D4]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <JsonLd data={faqJsonLd([
        { question: "What is Soma Digital Community?", answer: "Soma Digital Community is an AI operating system for digital entrepreneurs. It brings content creation, business planning, publishing, learning, community, and monetization into one connected workspace." },
        { question: "Who is SDC for?", answer: "SDC is for entrepreneurs, creators, freelancers, business owners, and beginners who want practical structure for building and growing a digital business without needing to be technical." },
        { question: "What can AI Studio create?", answer: "AI Studio helps you create business content such as social posts, scripts, blogs, emails, images, videos, voiceovers, and campaigns from guided workflows." },
        { question: "How does AI Mentor work?", answer: "AI Mentor turns your goals, business context, and audience into practical guidance, roadmaps, action plans, and next steps that help you keep moving." },
        { question: "What are Creator Credits?", answer: "Creator Credits are SDC's usage balance for AI generations. Explorer members can buy credits when needed, while Pro and Elite plans include monthly credits and optional top-ups." },
        { question: "What is the difference between Academy and Marketplace?", answer: "Academy is for structured courses, lessons, certifications, and course-related reseller rights. Marketplace is for digital products such as templates, tools, downloads, and external resources." },
        { question: "How does the Scheduler publish content?", answer: "Scheduler sends prepared content to connected social accounts using platform-specific settings for captions, media, privacy, disclosure, timing, and publishing permissions." },
      ])} />

      <section className="relative z-10 px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_15%_20%,rgba(79,157,255,0.2),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(139,92,246,0.22),transparent_36%),#151A2E] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.42)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#BFC6D4]">Ready when you are</p>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Start building your AI-powered digital business.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#BFC6D4]">
                Set up your profile, generate your roadmap, and enter the operating system with a clear next step.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button asChild className="h-14 rounded-[18px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-7 font-medium">
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-14 rounded-[18px] border-white/[0.08] bg-white/[0.03] px-7 text-white hover:bg-white/[0.08]">
                <Link href="/academy">View Academy</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#7E8799] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Soma Digital Community. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/login" className="hover:text-white">Login</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

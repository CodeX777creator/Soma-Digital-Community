"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import {
  Zap,
  Rocket,
  Globe,
  Shield,
  Star,
  ArrowRight,
  Play,
  Users,
  TrendingUp,
  Bot,
  CheckCircle2,
  ChevronRight,
  Target,
  Quote
} from "lucide-react";
import { PricingSection } from "@/components/landing/PricingSection";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dbService } from "@/lib/db";
import {
  Calendar,
  History,
  ArrowUpRight,
  Heart,
  MessageSquare,
  Sparkles,
  Trophy,
  Activity
} from "lucide-react";
import { VisionModal } from "@/components/landing/VisionModal";
import { useAuth } from "@/providers/AuthProvider";
import { OptimizedImage } from "@/components/ui/optimized-image";

function timeAgo(ts: any): string {
  if (!ts?.toDate) return "just now";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Home() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ memberCount: 0, discussionCount: 0, revenueGenerated: 0 });
  const [pulse, setPulse] = useState<any[]>([]);
  const [isVisionOpen, setIsVisionOpen] = useState(false);
  const [isCommunityDataLoading, setIsCommunityDataLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    const fetchAllData = async () => {
      try {
        const [statsData, recentActivity, recentMembers] = await Promise.all([
          dbService.getGlobalStats(),
          dbService.getRecentActivity(2),
          dbService.getRecentMembers(2)
        ]);
        setStats(statsData);

        const combined = [...recentActivity, ...recentMembers].sort((a, b) => {
          const timeA = a.time?.toDate?.()?.getTime() || 0;
          const timeB = b.time?.toDate?.()?.getTime() || 0;
          return timeB - timeA;
        });
        setPulse(combined);
      } catch (error) {
        setStats({ memberCount: 0, discussionCount: 0, revenueGenerated: 0 });
        setPulse([]);
      } finally {
        setIsCommunityDataLoading(false);
      }
    };
    fetchAllData();
  }, []);

  if (!mounted) return null;

  return (
    <AppLayout>
      <div className="flex flex-col gap-32 pb-32">
        {/* Hero Section */}
        <section id="hero" className="relative min-h-[85vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden pt-12">
          <div className="animate-reveal opacity-0 animation-delay-100">
            <Badge variant="outline" className="mb-8 border-primary/30 text-primary bg-primary/5 py-1.5 px-4 rounded-full font-bold uppercase tracking-widest text-[10px] blue-glow">
              <Zap className="w-3.5 h-3.5 mr-2 fill-primary" />
              The Smart Business Layer
            </Badge>
          </div>

          <h1 className="text-6xl md:text-9xl font-bold font-headline leading-[0.95] mb-8 tracking-tighter animate-reveal opacity-0 animation-delay-300">
            Grow Your Online <br />
            <span className="text-gradient">Business with AI</span>
          </h1>

          <p className="max-w-2xl mx-auto text-muted-foreground text-lg md:text-2xl mb-12 leading-relaxed animate-reveal opacity-0 animation-delay-500">
            Join a next-generation community powered by
            <span className="text-white font-medium"> AI coaching</span>,
            <span className="text-white font-medium"> time-saving tools</span>, and
            <span className="text-white font-medium"> top-tier learning</span>.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-reveal opacity-0 animation-delay-700">
            <Link href="/open?plan=explorer">
              <Button className="h-16 px-10 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow group transition-all">
                Get Started
                <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button
              onClick={() => setIsVisionOpen(true)}
              variant="ghost"
              className="h-16 px-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xl font-semibold backdrop-blur-sm"
            >
              <Play className="mr-3 fill-white w-5 h-5" />
              Watch Vision
            </Button>
          </div>

          <div className="mt-20 flex flex-wrap justify-center gap-8 md:gap-16 opacity-60 animate-reveal opacity-0 animation-delay-900">
            {isCommunityDataLoading ? (
              <p className="text-sm text-muted-foreground">Loading community metrics…</p>
            ) : (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-2xl md:text-3xl font-bold font-headline">{stats.memberCount}</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground whitespace-nowrap">Founding Entrepreneurs</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl md:text-3xl font-bold font-headline">${stats.revenueGenerated}</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground whitespace-nowrap">Community Revenue</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl md:text-3xl font-bold font-headline">{stats.discussionCount}</span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground whitespace-nowrap">Active Discussions</span>
                </div>
              </>
            )}
          </div>

          {/* Floating Dashboard Preview */}
          <div className="mt-24 relative w-full max-w-5xl mx-auto animate-reveal opacity-0 animation-delay-1100">
            <div className="absolute -inset-4 bg-primary/20 blur-[120px] rounded-full pointer-events-none opacity-50" />
            <GlassCard className="p-1 rounded-[2rem] border-white/10 overflow-hidden relative blue-glow">
              <img
                src="/dashboard_preview.png"
                alt="Dashboard Preview"
                className="w-full rounded-[1.8rem] object-cover aspect-video"
                data-ai-hint="dashboard screen"
              />
            </GlassCard>

            {/* Floating UI Elements */}
            <GlassCard className="absolute -top-12 -left-12 p-4 w-48 hidden lg:block animate-float" style={{ animationDuration: '8s' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-bold">Progress Tip</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full w-[70%] bg-accent cyan-glow" />
              </div>
            </GlassCard>

            <GlassCard className="absolute -bottom-8 -right-8 p-4 w-56 hidden lg:block animate-float" style={{ animationDuration: '12s', animationDelay: '1s' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-primary p-0.5">
                  <img src="/face1.png" alt="Latest Member" title="Latest Member" className="rounded-full w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary italic">LATEST MEMBER</p>
                  <p className="text-xs font-semibold">
                    {stats.memberCount > 0 ? `Join the ${stats.memberCount} Founders` : "Be among the first Founders"}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-3xl font-bold font-headline">AI Business Coach</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Personalized business advice, research help, and step-by-step plans created in seconds.
            </p>
            <ul className="space-y-3 mt-4">
              {['24/7 Expert Support', 'Plan Generation', 'Competitor Help'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 group-hover:scale-110 transition-transform">
              <Globe className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-3xl font-bold font-headline">Private Network</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              A private group of successful business owners. Connect, collaborate, and grow with the best.
            </p>
            <ul className="space-y-3 mt-4">
              {['Mastermind Groups', 'Expert Q&A Sessions', 'Global Feed Access'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
              <Star className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-3xl font-bold font-headline">Resource Center</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Exclusive tools, proven sales templates, and branding kits to help you grow.
            </p>
            <ul className="space-y-3 mt-4">
              {['Proven Sales Templates', 'Exclusive AI Prompts', 'Legal & Sales Kits'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Founder's Story & Transparency Section */}
        <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <div className="absolute -inset-4 bg-primary/20 blur-[100px] rounded-full opacity-30" />
            <div className="rounded-[3rem] w-full h-[600px] border border-white/10 shadow-2xl relative z-10 overflow-hidden">
              <OptimizedImage
                src="/founder_portrait.png"
                alt="Founder of Soma Digital"
                containerClassName="w-full h-full"
                className="w-full h-full object-cover"
              />
            </div>
            <GlassCard className="absolute -bottom-8 -right-8 p-6 w-72 z-20 animate-float" style={{ animationDuration: '10s' }}>
              <Quote className="w-8 h-8 text-primary mb-4 opacity-50" />
              <p className="text-sm italic text-white/90 leading-relaxed mb-4">
                "We aren't here to fake success. We're here to build it, brick by brick, together."
              </p>
              <p className="font-bold text-sm">Founder, Soma Digital</p>
            </GlassCard>
          </div>

          <div className="flex flex-col gap-8">
            <Badge variant="outline" className="w-fit border-primary/30 text-primary bg-primary/5 uppercase tracking-widest text-[10px] font-bold py-1 px-3">
              Transparent Mission
            </Badge>
            <h2 className="text-5xl md:text-7xl font-bold font-headline leading-tight">
              Built for <br /> <span className="text-gradient">Real Growth.</span>
            </h2>
            <p className="text-muted-foreground text-xl leading-relaxed">
              Most communities use fake numbers to lure you in. We do things differently. Soma Digital is a
              living organism. You are seeing our growth in real-time because we believe in radical transparency.
            </p>

            <div className="space-y-6 mt-4">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">The Mission</h4>
                  <p className="text-muted-foreground">To empower 1,000 digital entrepreneurs with AI-human hybrid coaching by 2026.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">The Promise</h4>
                  <p className="text-muted-foreground">No fluff. No fake gurus. Just tools, data, and a network of serious builders.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pulse of the Community (Recent Activity) */}
        <section id="results" className="max-w-7xl mx-auto px-6 w-full">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div className="text-left">
              <Badge variant="outline" className="mb-4 border-accent/30 text-accent bg-accent/5">LIVE ACTIVITY</Badge>
              <h2 className="text-4xl md:text-6xl font-bold font-headline">Community Pulse</h2>
            </div>
            <p className="text-muted-foreground max-w-md text-left md:text-right">
              Real-time updates from our founding members. See the network in action.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {isCommunityDataLoading ? (
              <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-3xl opacity-50">
                <p className="text-sm">Loading recent community activity…</p>
              </div>
            ) : pulse.length > 0 ? pulse.map((activity, i) => (
              <GlassCard key={i} className="flex flex-col gap-4 p-6 hover:border-primary/30 transition-all cursor-default group">
                <div className="flex justify-between items-start">
                  <div className={`p-2 rounded-lg ${activity.type === 'join' ? 'bg-blue-500/10 text-blue-400' :
                      activity.type === 'post' ? 'bg-purple-500/10 text-purple-400' :
                        activity.type === 'win' ? 'bg-green-500/10 text-green-400' :
                          'bg-accent/10 text-accent'
                    }`}>
                    {activity.type === 'join' && <Users className="w-4 h-4" />}
                    {activity.type === 'post' && <MessageSquare className="w-4 h-4" />}
                    {activity.type === 'win' && <Trophy className="w-4 h-4" />}
                    {activity.type === 'update' && <Activity className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{timeAgo(activity.time)}</span>
                </div>
                <div>
                  <p className="font-bold group-hover:text-primary transition-colors">{activity.user}</p>
                  <p className="text-sm text-muted-foreground">{activity.detail}</p>
                </div>
              </GlassCard>
            )) : (
              <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-3xl opacity-50">
                <p className="text-sm">Waiting for the first founding members to take action...</p>
              </div>
            )}
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-6 w-full">
          <GlassCard className="p-0 overflow-hidden border-white/10 rounded-[3rem]">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="p-12 md:p-20 flex flex-col justify-center gap-8">
                <Badge variant="outline" className="w-fit border-accent/30 text-accent bg-accent/5">
                  AI CAPABILITIES
                </Badge>
                <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">
                  Your Personal <br /> <span className="text-accent">Business Assistant.</span>
                </h2>
                <p className="text-muted-foreground text-xl leading-relaxed">
                  Soma AI doesn't just chat. It looks at your business, finds what's slowing you down,
                  and suggests clear steps to grow your income.
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Customer Research</p>
                      <p className="text-sm text-muted-foreground">Deep dives into your target audience.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Time-Saving Steps</p>
                      <p className="text-sm text-muted-foreground">Custom steps to reclaim your time.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-accent/20 to-primary/20 p-8 md:p-12 flex items-center justify-center">
                <GlassCard className="w-full max-w-md p-6 border-white/20 shadow-2xl relative animate-float" style={{ animationDuration: '15s' }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center cyan-glow">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold">Soma AI</h4>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Online</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm text-muted-foreground">
                      How can I scale my agency to $50k MRR this quarter?
                    </div>
                    <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20 text-sm">
                      Based on your current data, the fastest path is improving your customer
                      referrals and testing ads on social media. I've prepared a 30-day
                      step-by-step plan for you.
                    </div>
                    <div className="flex gap-2">
                      <Link href="/open">
                        <Badge variant="secondary" className="bg-white/5 hover:bg-white/10 cursor-pointer">View Plan</Badge>
                      </Link>
                      <Link href="/open">
                        <Badge variant="secondary" className="bg-white/5 hover:bg-white/10 cursor-pointer">Run Analysis</Badge>
                      </Link>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="h-12 w-full bg-white/5 border border-white/10 rounded-xl px-4 flex items-center justify-between text-muted-foreground text-sm italic">
                      Type your business goal...
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Pricing Section */}
        <div id="pricing">
          <PricingSection />
        </div>

        <section className="max-w-7xl mx-auto px-6 w-full">
          <div className="flex flex-col gap-12 p-12 md:p-20 rounded-[3rem] border border-white/10 bg-white/[0.02] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />

            <div className="text-center space-y-6 relative z-10">
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">OUR PATH FORWARD</Badge>
              <h2 className="text-4xl md:text-6xl font-bold font-headline">Transparent Roadmap</h2>
              <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
                We are just getting started. Here is exactly what we are building and when you can expect it.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              {[
                { phase: "Phase 1: Foundation", status: "Active", items: ["Custom AI Business Coaching", "Founding 100 Members", "Private Community Feed"] },
                { phase: "Phase 2: Acceleration", status: "Coming Q3 2026", items: ["Revenue Tracking Dashboard", "Exclusive Sales Templates", "Expert Mentorship Program"] },
                { phase: "Phase 3: Scale", status: "Planned 2027", items: ["Venture Partner Network", "Automated Business Kits", "Global Founders Summit"] }
              ].map((p, i) => (
                <div key={i} className="flex flex-col gap-6 p-8 rounded-3xl bg-white/5 border border-white/5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{p.status}</span>
                    <div className={`w-2 h-2 rounded-full ${p.status === 'Active' ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                  </div>
                  <h4 className="text-2xl font-bold font-headline">{p.phase}</h4>
                  <ul className="space-y-4">
                    {p.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto px-6 w-full">
          <h2 className="text-4xl font-bold font-headline mb-12 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-4">
            <AccordionItem value="item-1" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">What exactly is Soma Digital Community?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                Soma Digital Community is a premium membership for digital entrepreneurs that uses AI to provide business coaching, tools, and support.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">How does the AI Coach work?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                The AI Coach uses your business goals and challenges to give you personalized advice, plans, and clear steps to grow. It's like having a 24/7 consultant.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">Is this for beginners or experts?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                Both. Our Explorer tier is perfect for those just starting, while our Pro and Elite tiers are designed for scaling existing businesses into the 7 and 8-figure range.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 pt-20">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="flex flex-col gap-6">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center blue-glow group-hover:scale-110 transition-transform">
                  <Zap className="text-white w-5 h-5 fill-white" />
                </div>
                <span className="font-headline font-bold text-2xl tracking-tighter text-white">SOMA DIGITAL COMMUNITY</span>
              </Link>
              <p className="text-muted-foreground text-sm">
                Empowering the next generation of digital giants with the intelligence of tomorrow.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Ecosystem</h4>
              {user ? (
                <>
                  <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-white transition-colors">Dashboard</Link>
                  <Link href="/community" className="text-sm text-muted-foreground hover:text-white transition-colors">Community</Link>
                  <Link href="/mentor" className="text-sm text-muted-foreground hover:text-white transition-colors">AI Coach</Link>
                  <Link href="/marketplace" className="text-sm text-muted-foreground hover:text-white transition-colors">Resource Center</Link>
                </>
              ) : (
                <>
                  <Link href="/#features" className="text-sm text-muted-foreground hover:text-white transition-colors">Features</Link>
                  <Link href="/#results" className="text-sm text-muted-foreground hover:text-white transition-colors">Results</Link>
                  <Link href="/#pricing" className="text-sm text-muted-foreground hover:text-white transition-colors">Pricing</Link>
                  <Link href="/open" className="text-sm text-muted-foreground hover:text-white transition-colors">Start Onboarding</Link>
                </>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Resources</h4>
              <Link href="/blog" className="text-sm text-muted-foreground hover:text-white transition-colors">Founders Blog</Link>
              <Link href="/case-studies" className="text-sm text-muted-foreground hover:text-white transition-colors">Case Studies</Link>
              <Link href="/partners" className="text-sm text-muted-foreground hover:text-white transition-colors">Partner Program</Link>
              <Link href="/support" className="text-sm text-muted-foreground hover:text-white transition-colors">Support Center</Link>
            </div>

            <div className="flex flex-col gap-6">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Stay Connected</h4>
              <div className="flex gap-4">
                <Link href="/open" aria-label="Join Soma Digital" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 transition-all">
                  <Users className="w-4 h-4" />
                </Link>
                <Link href="/support" aria-label="Support Center" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 transition-all">
                  <Globe className="w-4 h-4" />
                </Link>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                © 2026 Soma Digital. <br /> All rights reserved. Built for you.
              </p>
            </div>
          </div>
        </footer>
      </div>
      <VisionModal isOpen={isVisionOpen} onClose={() => setIsVisionOpen(false)} />
    </AppLayout>
  );
}

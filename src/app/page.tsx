"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Zap, Rocket, Globe, Shield, Star, ArrowRight, Play } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-24 pb-20">
        {/* Hero Section */}
        <section className="relative pt-12 text-center md:pt-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary mb-8 animate-fade-in uppercase tracking-widest">
            <Zap className="w-3.5 h-3.5 fill-primary" />
            The Future of Digital Entrepreneurship
          </div>
          <h1 className="text-5xl md:text-8xl font-bold font-headline leading-[1.1] mb-8 tracking-tighter">
            Build Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Legacy</span> <br />
            with AI Mentorship
          </h1>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg md:text-xl mb-12">
            The world's most intelligent entrepreneurial community. Powered by Gemini AI, 
            designed for high-performance creators and digital builders.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/onboarding">
              <Button className="h-14 px-8 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group">
                Join the Hub
                <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button variant="ghost" className="h-14 px-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-lg font-semibold transition-all">
              <Play className="mr-2 fill-white w-4 h-4" />
              Watch Vision
            </Button>
          </div>
        </section>

        {/* Stats / Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard glow className="flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6 text-primary fill-primary" />
            </div>
            <h3 className="text-2xl font-bold font-headline">AI Mentor Agent</h3>
            <p className="text-muted-foreground leading-relaxed">
              Real-time strategic advice and personalized business roadmaps powered by Gemini 2.5 Flash.
            </p>
          </GlassCard>

          <GlassCard className="flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center border border-accent/30 group-hover:scale-110 transition-transform">
              <Globe className="w-6 h-6 text-accent fill-accent" />
            </div>
            <h3 className="text-2xl font-bold font-headline">Premium Network</h3>
            <p className="text-muted-foreground leading-relaxed">
              Connect with 7-figure digital entrepreneurs and creators in a high-fidelity community feed.
            </p>
          </GlassCard>

          <GlassCard className="flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 transition-transform">
              <Star className="w-6 h-6 text-purple-400 fill-purple-400" />
            </div>
            <h3 className="text-2xl font-bold font-headline">Gamified Results</h3>
            <p className="text-muted-foreground leading-relaxed">
              Track your streaks, unlock achievement badges, and level up your business XP daily.
            </p>
          </GlassCard>
        </section>

        {/* Premium Teaser */}
        <section className="relative overflow-hidden rounded-[3rem] border border-white/5 bg-gradient-to-b from-card to-background p-8 md:p-16">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="max-w-3xl flex flex-col gap-6 relative z-10">
            <div className="text-accent font-bold tracking-[0.2em] uppercase text-sm">Elevate Your Presence</div>
            <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">
              Unlock the <span className="text-primary">Premium Vault</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Get exclusive access to high-converting funnels, branding templates, and the full power of our AI Strategic Mentor. No more guessing, just scaling.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <div className="flex items-center gap-2 text-sm text-white/80 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <Shield className="w-4 h-4 text-primary" /> Exclusive Tools
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <Rocket className="w-4 h-4 text-accent" /> Priority Support
              </div>
              <div className="flex items-center gap-2 text-sm text-white/80 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <Star className="w-4 h-4 text-yellow-400" /> Lifetime Updates
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

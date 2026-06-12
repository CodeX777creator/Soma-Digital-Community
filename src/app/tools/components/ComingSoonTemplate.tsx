"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/useUserStore";
import {
  ArrowLeft,
  Clock,
  Sparkles,
  Lock,
  Zap,
  Crown,
  CheckCircle2,
  Rocket,
} from "lucide-react";

interface ComingSoonTemplateProps {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  useCases: string[];
  estimatedRelease: string;
  tier: "explorer" | "pro" | "elite";
}

export function ComingSoonTemplate({
  icon,
  title,
  tagline,
  description,
  features,
  useCases,
  estimatedRelease,
  tier,
}: ComingSoonTemplateProps) {
  const userTier = useUserStore((state) => state.tier);
  const isLocked = tier !== "explorer" && userTier === "explorer";

  const tierConfig = {
    explorer: { label: "Free", color: "text-muted-foreground", border: "border-white/20" },
    pro: { label: "Pro", color: "text-cyan-400", border: "border-cyan-500/30" },
    elite: { label: "Elite", color: "text-yellow-400", border: "border-yellow-500/30" },
  };

  const config = tierConfig[tier];

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-700 py-8">
      {/* Back Link */}
      <Link
        href="/tools"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tools
      </Link>

      {/* Hero Section */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <Badge className="bg-primary/20 text-primary border-primary/30">
            <Rocket className="w-3 h-3 mr-1" /> Coming in Phase 2
          </Badge>
          <Badge variant="outline" className={`text-[10px] uppercase ${config.border} ${config.color}`}>
            {isLocked && <Lock className="w-2.5 h-2.5 mr-1" />}
            {config.label} Tool
          </Badge>
        </div>

        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-6">
          {icon}
        </div>

        <h1 className="text-4xl md:text-5xl font-bold font-headline">{title}</h1>
        <p className="text-xl text-muted-foreground mt-4 max-w-2xl mx-auto">
          {tagline}
        </p>
      </div>

      {/* Release Timeline */}
      <GlassCard className="p-6 bg-gradient-to-r from-accent/10 via-primary/5 to-accent/10 border-accent/20">
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
          <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold">Expected Release</h3>
            <p className="text-muted-foreground text-sm">
              {estimatedRelease}
            </p>
          </div>
          <div className="text-sm text-accent font-medium">
            Join 100+ early adopters
          </div>
        </div>
      </GlassCard>

      {/* Description */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          What is {title}?
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          {description}
        </p>
      </GlassCard>

      {/* Features Grid */}
      <div>
        <h2 className="text-xl font-bold mb-4">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, i) => (
            <GlassCard key={i} className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm">{feature}</span>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Use Cases */}
      <div>
        <h2 className="text-xl font-bold mb-4">How You&apos;ll Use It</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {useCases.map((useCase, i) => (
            <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5">
              <span className="text-sm text-muted-foreground">{useCase}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview/Teaser Placeholder */}
      <GlassCard className="p-8 text-center border-dashed border-2 border-white/10 bg-white/[0.02]">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-bold mb-2">Interactive Preview Coming Soon</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We&apos;re building an interactive demo so you can test {title} before it launches. 
          Check back soon!
        </p>
      </GlassCard>

      {/* CTA Section */}
      <div className="text-center py-8 space-y-4">
        {isLocked ? (
          <>
            <p className="text-muted-foreground">
              This tool will be available with the {tier === "elite" ? "Elite" : "Pro"} tier
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={`/dashboard?upgrade=${tier}`}>
                <Button className="bg-primary hover:bg-primary/90">
                  <Zap className="w-4 h-4 mr-2" />
                  Upgrade to {tier === "elite" ? "Elite" : "Pro"}
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              This tool will be available to all members
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/community">
                <Button variant="outline">
                  Join the Waitlist Discussion
                </Button>
              </Link>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {tier === "elite" ? (
            <>
              <Crown className="w-3 h-3 inline mr-1" />
              Elite members get priority access + exclusive features
            </>
          ) : tier === "pro" ? (
            <>
              <Zap className="w-3 h-3 inline mr-1" />
              Pro & Elite members get early access when it launches
            </>
          ) : (
            <>
              Free for all Soma Digital members
            </>
          )}
        </p>
      </div>
    </div>
  );
}

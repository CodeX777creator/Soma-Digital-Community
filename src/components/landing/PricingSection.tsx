"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Zap, Shield, Trophy, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const plans = [
  {
    id: "explorer",
    name: "Explorer",
    price: "$0",
    badge: "Start Your Journey",
    urgency: "Early Adopter Pricing",
    desc: "Get a taste of the community.",
    icon: <Rocket className="w-6 h-6" />,
    features: ["Public Feed Access", "Basic AI Search", "Community Profile", "Public Masterminds"],
    color: "white",
    cta: "Join Free",
    buttonVariant: "outline" as const,
  },
  {
    id: "pro",
    name: "Pro Member",
    price: "$97",
    badge: "Most Popular",
    urgency: "Founding Member Access",
    desc: "Perfect for growing your business.",
    icon: <Zap className="w-6 h-6 text-primary" />,
    features: [
      "Talk to our AI Coach",
      "Resource Library",
      "Private Member Feed",
      "Weekly Live Calls",
      "Business Templates"
    ],
    color: "primary",
    cta: "Go Pro Now",
    buttonVariant: "default" as const,
    popular: true,
  },
  {
    id: "elite",
    name: "Elite Soma",
    price: "$297",
    badge: "Complete AI Business Tools",
    urgency: "Limited Availability",
    desc: "For leaders scaling to the top.",
    icon: <Trophy className="w-6 h-6 text-accent" />,
    features: [
      "Everything in Pro",
      "Custom AI Help",
      "Special Events",
      "Unlimited Resources",
      "Talk to the Founders"
    ],
    color: "accent",
    cta: "Join Elite",
    buttonVariant: "outline" as const,
  },
];

import { Rocket } from "lucide-react";

export function PricingSection() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handlePlanSelect = (planId: string) => {
    setLoadingPlan(planId);
    // Simulate prep time for premium feel
    setTimeout(() => {
      router.push(`/open?plan=${planId}`);
    }, 800);
  };

  return (
    <section id="pricing" className="max-w-7xl mx-auto px-6 w-full py-24">
      <div className="flex flex-col items-center gap-6 mb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5 uppercase tracking-widest text-[10px]">
            Pricing & Access
          </Badge>
          <h2 className="text-5xl md:text-7xl font-bold font-headline mb-6">Choose Your Path</h2>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
            Scalable memberships for every stage of your entrepreneurial journey. 
            Join the founding wave of digital leaders.
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {plans.map((plan, idx) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: idx * 0.1 }}
            className="h-full"
          >
            <GlassCard 
              glow={plan.popular}
              className={cn(
                "flex flex-col gap-8 p-10 h-full transition-all duration-500 border-white/5 relative group hover:border-white/20",
                plan.popular ? "border-primary/20 scale-[1.02] md:scale-110 z-10" : "hover:scale-[1.02]"
              )}
            >
              {/* Badges & Urgency */}
              <div className="flex flex-col gap-2 absolute -top-4 left-1/2 -translate-x-1/2 w-full items-center">
                <Badge className={cn(
                  "font-bold px-4 py-1 blue-glow",
                  plan.popular ? "bg-primary" : "bg-white/10 text-white border-white/20"
                )}>
                  {plan.badge}
                </Badge>
                <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary animate-pulse">
                  {plan.urgency}
                </span>
              </div>

              <div className="text-left mt-4">
                <div className="flex items-center justify-between mb-4">
                   <div className={cn(
                     "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500",
                     plan.popular ? "bg-primary/20" : "bg-white/5"
                   )}>
                     {plan.icon}
                   </div>
                </div>
                <h3 className={cn(
                  "text-2xl font-bold font-headline",
                  plan.id === 'pro' && "text-primary",
                  plan.id === 'elite' && "text-accent"
                )}>{plan.name}</h3>
                <p className="text-muted-foreground mt-2 text-sm">{plan.desc}</p>
              </div>

              <div className="text-left">
                <span className="text-5xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>

              {/* Feature Preview */}
              <div className="flex-1 space-y-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-4">What's included:</p>
                {plan.features.map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm group/item">
                    <CheckCircle2 className={cn(
                      "w-4 h-4 transition-colors",
                      plan.id === 'pro' ? "text-primary" : plan.id === 'elite' ? "text-accent" : "text-white/40"
                    )} /> 
                    <span className="text-white/70 group-hover/item:text-white transition-colors">{item}</span>
                  </div>
                ))}
              </div>

              {/* Plan Button with Loading State */}
              <Button 
                onClick={() => handlePlanSelect(plan.id)}
                disabled={!!loadingPlan}
                variant={plan.buttonVariant}
                className={cn(
                  "w-full h-14 rounded-full font-bold transition-all duration-300 relative overflow-hidden group",
                  plan.popular ? "bg-primary hover:bg-primary/90 active:scale-[0.98] active:brightness-110 blue-glow" : "border-white/10 hover:bg-white/5 active:scale-[0.98] active:bg-white/10",
                  plan.id === 'elite' && "hover:bg-accent hover:text-black hover:border-accent active:bg-accent active:text-black"
                )}
              >
                {loadingPlan === plan.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {plan.cta}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                  </>
                )}
              </Button>

              {/* Feature Unlock Preview - Subtle Footer */}
              <div className="text-[10px] text-muted-foreground/50 text-center italic group-hover:text-muted-foreground transition-colors">
                {plan.id === 'explorer' && "Unlock full AI access in higher tiers"}
                {plan.id === 'pro' && "Join 2,400+ builders already scaling"}
                {plan.id === 'elite' && "Personalized architecture for global reach"}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

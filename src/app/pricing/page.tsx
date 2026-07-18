"use client";

import { motion } from "framer-motion";
import { Check, X, Sparkles, Zap, Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { cn } from "@/lib/utils";

const plans = [
  {
    id: "explorer",
    name: "Explorer",
    price: 0,
    description: "Get started with the community",
    icon: Sparkles,
    color: "text-muted-foreground",
    borderColor: "border-white/10",
    buttonText: "Get Started Free",
    buttonVariant: "outline" as const,
    features: [
      { text: "Full community access", included: true, highlight: false },
      { text: "AI Studio access", included: true, highlight: false },
      { text: "Browse all resources", included: true, highlight: false },
      { text: "Join live calls (watch only)", included: true, highlight: false },
      { text: "Buy Creator Credits when needed", included: true, highlight: false },
      { text: "Download Pro/Elite resources", included: false, highlight: false },
      { text: "Live call participation", included: false, highlight: false },
      { text: "Founder access", included: false, highlight: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 97,
    popular: true,
    description: "Perfect for growing your business",
    icon: Zap,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/50",
    bgGradient: "from-cyan-950/30 to-transparent",
    buttonText: "Start Pro Trial",
    buttonVariant: "default" as const,
    badge: "MOST POPULAR",
    features: [
      { text: "Everything in Explorer", included: true, highlight: false },
      { text: "Monthly Creator Credits included", included: true, highlight: true },
      { text: "Unlimited Pro resource downloads", included: true, highlight: false },
      { text: "Weekly live call participation", included: true, highlight: false },
      { text: "Business templates & tools", included: true, highlight: false },
      { text: "Universal Creator Credit bundles", included: true, highlight: true },
      { text: "Private member community", included: true, highlight: false },
      { text: "1-on-1 founder mentorship", included: false, highlight: false },
    ],
  },
  {
    id: "elite",
    name: "Elite",
    price: 297,
    description: "For leaders scaling to the top",
    icon: Crown,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/50",
    bgGradient: "from-yellow-950/30 to-transparent",
    buttonText: "Go Elite",
    buttonVariant: "outline" as const,
    badge: "UNLIMITED",
    features: [
      { text: "Everything in Pro", included: true, highlight: false },
      { text: "Highest included Creator Credit allocation", included: true, highlight: true },
      { text: "Unlimited Elite resources", included: true, highlight: true },
      { text: "Unlimited live call participation", included: true, highlight: false },
      { text: "Monthly 1-on-1 founder call", included: true, highlight: true },
      { text: "Direct WhatsApp with founder", included: true, highlight: true },
      { text: "Verified Elite badge", included: true, highlight: false },
      { text: "Custom AI business tools", included: true, highlight: false },
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117]">
      {/* Hero */}
      <section className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-6">
              Simple Pricing
            </span>
            <h1 className="text-4xl md:text-6xl font-bold font-headline text-white mb-4">
              Invest in Your Growth
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Start free, upgrade when you&apos;re ready. Pro is designed to be the sweet spot for 
              serious entrepreneurs.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={cn(
                  "relative",
                  plan.popular && "md:-mt-4 md:mb-4"
                )}
              >
                {plan.badge && (
                  <div className={cn(
                    "absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    plan.name === "Pro" 
                      ? "bg-cyan-500 text-black" 
                      : "bg-yellow-500 text-black"
                  )}>
                    {plan.badge}
                  </div>
                )}
                
                <GlassCard className={cn(
                  "h-full p-6 rounded-3xl border-2 transition-all hover:scale-[1.02]",
                  plan.borderColor,
                  plan.bgGradient && `bg-gradient-to-b ${plan.bgGradient}`
                )}>
                  {/* Header */}
                  <div className="text-center mb-6">
                    <plan.icon className={cn("w-12 h-12 mx-auto mb-4", plan.color)} />
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-white">${plan.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <Button 
                    asChild
                    className={cn(
                      "w-full h-12 rounded-xl font-bold mb-6",
                      plan.name === "Pro" 
                        ? "bg-cyan-500 hover:bg-cyan-600 text-black"
                        : plan.name === "Elite"
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                        : ""
                    )}
                    variant={plan.buttonVariant}
                  >
                    <Link href={plan.id === "explorer" ? "/open?plan=explorer" : `/dashboard?upgrade=${plan.id}`}>
                      {plan.buttonText}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>

                  {/* Features */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      What&apos;s included
                    </p>
                    {plan.features.map((feature, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "flex items-start gap-3 text-sm",
                          !feature.included && "opacity-40"
                        )}
                      >
                        {feature.included ? (
                          <Check className={cn(
                            "w-4 h-4 mt-0.5 shrink-0",
                            feature.highlight ? plan.color : "text-green-400"
                          )} />
                        ) : (
                          <X className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        )}
                        <span className={feature.highlight ? "text-white font-medium" : ""}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit Pricing Section */}
      <section className="py-24 px-4 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Need More Creator Credits?</h2>
            <p className="text-muted-foreground">
              Run out of your monthly quota? Purchase additional credits anytime.
              Credits never expire, and bundle prices are the same across every plan.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <GlassCard className="p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-2">Starter Bundles</h3>
              <p className="text-sm text-muted-foreground mb-4">Same prices for every plan</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">5 Credits</span>
                  <span className="font-bold">$1.25</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">10 Credits</span>
                  <span className="font-bold">$2.25</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">25 Credits</span>
                  <span className="font-bold">$5.00</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Explorer can buy credits as needed or upgrade for monthly included credits.
              </p>
            </GlassCard>

            <GlassCard className="p-6 rounded-2xl border-cyan-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Growth Bundles</h3>
              </div>
              <p className="text-sm text-cyan-400 mb-4">Universal Creator Credit bundles</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">50 Credits</span>
                  <span className="font-bold text-cyan-400">$4.50</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">100 Credits</span>
                  <span className="font-bold text-green-400">$8.00</span>
                  <span className="text-[10px] text-muted-foreground">Save 20%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-lg">
                  <span className="text-sm">250 Credits</span>
                  <span className="font-bold text-green-400">$17.50</span>
                  <span className="text-[10px] text-muted-foreground">Save 30%</span>
                </div>
              </div>
              <p className="text-xs text-cyan-400 mt-4">
                Pro and Elite include monthly Creator Credits and can top up anytime.
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Common Questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "Can I upgrade or downgrade anytime?",
                a: "Yes! You can upgrade instantly. If you downgrade, you'll keep your current tier until the end of your billing period."
              },
              {
                q: "What happens when I run out of AI credits?",
                a: "You can purchase more credits anytime, or upgrade to Pro/Elite for more monthly quota. Credits never expire."
              },
              {
                q: "Is there a free trial for Pro?",
                a: "Yes! Start with a 7-day free trial of Pro. No credit card required."
              },
              {
                q: "What's the difference between Pro and Elite?",
                a: "Elite gives you unlimited everything, direct 1-on-1 access to the founder, and exclusive content. It's for those who want maximum growth."
              },
            ].map((faq, i) => (
              <GlassCard key={i} className="p-6 rounded-2xl">
                <h3 className="font-bold text-white mb-2">{faq.q}</h3>
                <p className="text-muted-foreground text-sm">{faq.a}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

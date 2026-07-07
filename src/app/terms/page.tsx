"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Shield, Scale, ScrollText } from "lucide-react";
import { motion } from "framer-motion";

export default function TermsOfService() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-10 py-12 animate-in fade-in duration-700">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 blue-glow">
            <Scale className="text-primary w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-headline tracking-tighter">Terms of Service</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Last Updated: July 7, 2026</p>
        </header>

        <GlassCard className="p-8 md:p-12 border-primary/20 space-y-8 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              1. Acceptance of Terms
            </h2>
            <p className="text-muted-foreground">
              Welcome to Soma Digital Community ("Soma", "we", "us", or "our"). By accessing or using our website, platform, AI coaching tools, and community services (collectively, the "Services"), you agree to comply with and be bound by these Terms of Service. If you do not agree, please do not use our Services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              2. Account Registration and Security
            </h2>
            <p className="text-muted-foreground">
              To access certain features of the platform, including the AI Coach and Community feed, you must register for an account. You agree to provide accurate, current, and complete information and maintain the security of your account credentials. You are solely responsible for all activity occurring under your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" />
              3. Community Rules and Conduct
            </h2>
            <p className="text-muted-foreground">
              Soma Digital is a professional community of entrepreneurs and builders. You agree not to post harmful, abusive, harassing, misleading, or illegal content. We reserve the right to remove any post and suspend or terminate accounts that violate our community standards.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              4. Subscription Tiers & Billing
            </h2>
            <p className="text-muted-foreground">
              Access to Pro and Elite tiers is provided on a subscription basis. Subscriptions are billed in advance on a recurring schedule. You may cancel your subscription at any time; however, we do not offer refunds for partial billing cycles. All transactions are processed securely.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              5. Intellectual Property
            </h2>
            <p className="text-muted-foreground">
              The platform structure, design, graphics, AI interfaces, and proprietary resources are owned by Soma Digital or its licensors. You are granted a limited, non-exclusive, non-transferable license to access resources in accordance with your subscription tier.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" />
              6. Limitation of Liability
            </h2>
            <p className="text-muted-foreground">
              Soma Digital provides educational resources, networking opportunities, and AI-generated insights. We make no guarantees regarding business revenue, outcomes, or scale. The Services are provided "as is" without warranty of any kind.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              7. Amendments
            </h2>
            <p className="text-muted-foreground">
              We reserve the right to amend these terms at any time. We will notify users of major updates. Continued use of the Services following amendments constitutes acceptance of the new terms.
            </p>
          </section>
        </GlassCard>
      </div>
    </AppLayout>
  );
}

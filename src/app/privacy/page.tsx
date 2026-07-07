"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Eye, Shield, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function PrivacyPolicy() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-10 py-12 animate-in fade-in duration-700">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 cyan-glow">
            <Eye className="text-accent w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-headline tracking-tighter">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Last Updated: July 7, 2026</p>
        </header>

        <GlassCard className="p-8 md:p-12 border-accent/20 space-y-8 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              1. Information We Collect
            </h2>
            <p className="text-muted-foreground">
              We collect information you provide directly to us when registering an account, utilizing the AI Coach, or interacting with the community. This includes your name, email address, selected business identities, business goals, and chat histories with our AI mentors.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              2. How We Use Your Information
            </h2>
            <p className="text-muted-foreground">
              We use the collected information to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Deliver, personalize, and improve our AI coaching models and platform features.</li>
              <li>Enable community interaction, notifications, and profile tracking.</li>
              <li>Process subscriptions and billing safely.</li>
              <li>Communicate platform announcements, upgrades, and support requests.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              3. Sharing and Disclosing Information
            </h2>
            <p className="text-muted-foreground">
              We do not sell, rent, or trade your personal data. We only share data with trusted service providers necessary to operate our platform (e.g. Firebase Auth, payment gateways like Paystack or PayPal, and LLM APIs for AI coaching), subject to strict data protection obligations.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent" />
              4. Data Retention and Security
            </h2>
            <p className="text-muted-foreground">
              We implement advanced security measures including encryption and secure sessions to protect your data. Your data is retained as long as your account is active or needed to provide Services. You can request deletion of your account and associated data at any time by contacting support.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              5. Cookies and Analytics
            </h2>
            <p className="text-muted-foreground">
              We use cookies to maintain your login session and cache onboarding configurations locally. We also collect aggregated, anonymous usage statistics to monitor site performance and platform reach.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-400" />
              6. Your Rights
            </h2>
            <p className="text-muted-foreground">
              Depending on your location, you may have rights under the GDPR, CCPA, or other data protection laws to access, correct, delete, or limit the processing of your personal data. Please reach out to support for any inquiries.
            </p>
          </section>
        </GlassCard>
      </div>
    </AppLayout>
  );
}

"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Shield, Scale, ScrollText } from "lucide-react";

const updatedAt = "July 13, 2026";

const sections = [
  {
    icon: ScrollText,
    iconClass: "text-primary",
    title: "1. Acceptance of Terms",
    body: [
      `Welcome to Soma Digital Community ("SDC", "Soma", "we", "us", or "our"). These Terms of Service govern your access to and use of our website, community, AI tools, business operating system features, marketplace, social media tools, subscriptions, Creator Credits, and related services (collectively, the "Services").`,
      "By creating an account, buying credits, connecting a third-party account, subscribing, publishing content, or otherwise using the Services, you agree to these Terms. If you do not agree, you must not use the Services.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "2. Account Registration, Eligibility, and Security",
    body: [
      "You are responsible for providing accurate account, profile, onboarding, business, billing, and contact information. You are also responsible for keeping your login credentials secure and for all activity under your account.",
      "Some areas of the Services may require email verification, an active subscription, Creator Credits, connected social accounts, or administrator approval. We may suspend, restrict, or terminate accounts that violate these Terms, abuse the platform, create security risk, or interfere with other users.",
    ],
  },
  {
    icon: Scale,
    iconClass: "text-purple-400",
    title: "3. Community Rules and User Content",
    body: [
      "SDC is a professional community for entrepreneurs, creators, marketers, and business builders. You agree not to post, upload, publish, schedule, distribute, or transmit content that is illegal, abusive, harassing, deceptive, infringing, hateful, sexually exploitative, spammy, or harmful.",
      "You retain ownership of content you submit, including posts, comments, prompts, assets, uploads, business information, and generated content you choose to use. You grant SDC a limited license to host, process, display, store, transmit, moderate, and use that content only as needed to operate and improve the Services.",
      "We may remove content, limit reach, disable publishing, or take account action when we believe content violates these Terms, platform rules, third-party policies, intellectual property rights, or applicable law.",
    ],
  },
  {
    icon: ScrollText,
    iconClass: "text-primary",
    title: "4. Subscriptions, Creator Credits, and Billing",
    body: [
      "SDC may offer Explorer, Pro, Elite, Enterprise, or other plan levels. Paid plans are billed through third-party payment processors such as Paystack or PayPal. Subscription pricing, included features, monthly Creator Credit allocations, limits, and plan benefits may change over time.",
      "Creator Credits are an in-app usage unit for eligible AI-powered features. Users may receive monthly credits based on plan rules or may buy credit bundles. Credits do not represent cash, stored value, cryptocurrency, or a deposit account, and they may only be used inside SDC for supported features.",
      "Credit charges may be reserved before an AI request runs and finalized after completion. If a request fails before completion, reserved credits may be refunded according to our platform rules. Scheduling content itself does not consume credits unless AI generation is used.",
      "Unless required by law or expressly stated at purchase, subscription fees, marketplace purchases, and Creator Credit bundles are non-refundable. Cancellations, downgrades, and failed payments may affect access, limits, and included credits at the end of the applicable billing or entitlement period.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "5. AI Features and Generated Outputs",
    body: [
      "The Services may include AI Mentor, AI Chat, AI Studio, content generation, image generation, video generation, audio or voice generation, translation, business planning, sales coaching, funnel generation, social media generation, and related AI workflows.",
      "AI outputs may be incomplete, inaccurate, outdated, offensive, non-compliant, or unsuitable for your specific business, audience, jurisdiction, brand, or platform. You are responsible for reviewing, editing, fact-checking, testing, and approving all AI outputs before relying on them or publishing them.",
      "SDC does not guarantee revenue, business growth, ad performance, legal compliance, tax treatment, financial outcomes, medical outcomes, investment returns, or platform approval. AI-generated guidance is informational and educational only and is not professional legal, tax, medical, financial, investment, or accounting advice.",
    ],
  },
  {
    icon: Scale,
    iconClass: "text-purple-400",
    title: "6. BYOK and Third-Party AI Providers",
    body: [
      "If you connect your own AI provider keys through BYOK (Bring Your Own API Key), you authorize SDC to use those credentials only for authenticated requests made by your account and according to your selected provider mode.",
      "You are responsible for your own provider accounts, API usage, invoices, rate limits, acceptable-use rules, model availability, and third-party terms. SDC is not responsible for charges, suspensions, data handling, model behavior, or service interruptions caused by your third-party provider accounts.",
    ],
  },
  {
    icon: ScrollText,
    iconClass: "text-primary",
    title: "7. Social Accounts, Scheduling, and Publishing",
    body: [
      "If you connect TikTok, Instagram, Facebook, LinkedIn, X, YouTube, or other social accounts, you authorize SDC to store encrypted OAuth tokens and use them for the features you enable, such as account management, scheduling, publishing, analytics, token refresh, and related workflow automation.",
      "You are responsible for ensuring that all content you generate, schedule, upload, reuse, or publish complies with each social platform's rules, advertising policies, intellectual property rules, and applicable law. SDC does not guarantee that scheduled posts will publish successfully or that social platforms will accept, rank, display, monetize, or maintain your content.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "8. Marketplace, Digital Products, and Licenses",
    body: [
      "The SDC marketplace may offer courses, templates, resources, digital products, tools, bundles, MRR products, resale-enabled products, and related assets. Your right to access or resell a marketplace item depends on the specific license, tier, purchase terms, and product rules shown at the time of access or purchase.",
      "You may not copy, resell, sublicense, distribute, or commercialize marketplace assets unless the applicable product license expressly allows it. Where MRR or resale rights are offered, you must comply with all license terms, pricing restrictions, branding rules, platform policies, and applicable laws.",
    ],
  },
  {
    icon: Scale,
    iconClass: "text-purple-400",
    title: "9. Intellectual Property and Platform Rights",
    body: [
      "The SDC platform, design, software, workflows, prompts, interfaces, trademarks, content, systems, documentation, and proprietary resources are owned by SDC or its licensors. You receive a limited, revocable, non-exclusive, non-transferable right to use the Services according to your account status and these Terms.",
      "You may not reverse engineer, scrape, resell, abuse, interfere with, or bypass limits, security controls, rate limits, entitlement checks, payment checks, or access controls in the Services.",
    ],
  },
  {
    icon: ScrollText,
    iconClass: "text-primary",
    title: "10. Service Availability, Changes, and Beta Features",
    body: [
      "We may add, remove, limit, suspend, rename, or modify features, models, integrations, pricing, credit rules, usage limits, provider routing, publishing workflows, or marketplace items at any time. Some features may be experimental, beta, provider-dependent, or subject to third-party availability.",
      "We may perform maintenance or experience outages. We are not liable for delays, data loss, failed generations, failed publishing attempts, third-party downtime, provider outages, or interruptions outside our reasonable control.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "11. Limitation of Liability",
    body: [
      `The Services are provided "as is" and "as available" without warranties of any kind. To the maximum extent permitted by law, SDC will not be liable for indirect, incidental, special, consequential, punitive, lost-profit, lost-revenue, lost-data, reputational, platform-ban, or business-interruption damages.`,
      "Our total liability for any claim relating to the Services will not exceed the amount you paid to SDC for the Services giving rise to the claim during the three months before the event that caused the claim, unless applicable law requires otherwise.",
    ],
  },
  {
    icon: Scale,
    iconClass: "text-purple-400",
    title: "12. Updates to These Terms",
    body: [
      "We may update these Terms as the product, laws, providers, or business model evolves. We will update the date above and may provide notice for material changes. Continued use of the Services after an update means you accept the revised Terms.",
      "These Terms are intended to be clear and practical, but they are not a substitute for legal advice. You should consult qualified counsel for your own legal obligations.",
    ],
  },
];

export default function TermsOfService() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-10 py-12 animate-in fade-in duration-700">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 blue-glow">
            <Scale className="text-primary w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-headline tracking-tighter">Terms of Service</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Last Updated: {updatedAt}</p>
        </header>

        <GlassCard className="p-8 md:p-12 border-primary/20 space-y-8 leading-relaxed">
          {sections.map(({ icon: Icon, iconClass, title, body }) => (
            <section key={title} className="space-y-4">
              <h2 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
                <Icon className={`w-5 h-5 ${iconClass}`} />
                {title}
              </h2>
              {body.map((paragraph) => (
                <p key={paragraph} className="text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </GlassCard>
      </div>
    </AppLayout>
  );
}

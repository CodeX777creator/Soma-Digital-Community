"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Eye, Shield, Lock } from "lucide-react";

const updatedAt = "July 13, 2026";

const sections = [
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "1. Information We Collect",
    body: [
      "We collect information you provide when you create an account, complete onboarding, set business goals, join the community, subscribe, buy Creator Credits, connect providers, connect social accounts, generate content, upload media, publish or schedule content, purchase marketplace items, or contact support.",
      "This may include your name, email address, profile photo, business identity, goals, skill level, preferences, plan, subscription status, payment metadata, Creator Credit activity, AI prompts, AI chat history, generated text, images, videos, audio, translations, documents, uploaded files, saved assets, social account metadata, scheduling records, publish logs, notifications, and marketplace purchase records.",
      "We also collect technical information such as device/browser data, log data, authentication events, usage telemetry, error events, rate-limit signals, provider routing decisions, model usage, estimated credit usage, and security/audit logs.",
    ],
  },
  {
    icon: Lock,
    iconClass: "text-primary",
    title: "2. How We Use Information",
    body: [
      "We use information to operate, secure, personalize, and improve SDC; authenticate users; maintain profiles and subscriptions; process payments; provide Creator Credits; run AI requests; store generated assets; support community features; schedule and publish content; show analytics; provide notifications; prevent abuse; and respond to support requests.",
      "We may use prompts, context, conversation summaries, business goals, preferences, and content history to provide AI Mentor, AI Studio, AI memory, business planning, content generation, and recommendation features. We may also use aggregated or de-identified usage data to understand product performance, cost, quality, and reliability.",
    ],
  },
  {
    icon: Eye,
    iconClass: "text-purple-400",
    title: "3. Firebase, Storage, and Platform Infrastructure",
    body: [
      "SDC uses Firebase Authentication, Firestore, Firebase Storage, Firebase Cloud Functions, and related infrastructure to provide account login, database records, media storage, background jobs, notifications, scheduling, payment webhooks, analytics, and security controls.",
      "Your data may be stored in user profiles, community posts, comments, notifications, generated artifact records, Creator Credit ledgers, provider connection records, social account records, scheduled post records, marketplace purchase records, webhook logs, audit logs, and storage objects.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "4. AI Providers and Generated Content",
    body: [
      "When you use AI features, the prompts, uploaded context, conversation history, selected settings, and relevant account context may be sent to AI providers, model gateways, or infrastructure vendors as needed to complete your request.",
      "Different AI tasks may use different providers or models. We use provider routing, logging, rate limits, credits, and telemetry to manage quality, performance, security, abuse prevention, and cost. We do not show users raw provider token pricing inside the product.",
      "Generated outputs and metadata may be stored so you can view history, reuse assets, regenerate outputs, analyze usage, and maintain persistent AI context.",
    ],
  },
  {
    icon: Lock,
    iconClass: "text-primary",
    title: "5. BYOK Provider Keys and Social OAuth Tokens",
    body: [
      "If you add your own AI provider API keys through BYOK, we encrypt those credentials at rest and do not expose the raw keys to the client after submission. We use them only for authenticated requests by your account according to your selected provider mode.",
      "If you connect social accounts, we store OAuth tokens and related account metadata in encrypted form where applicable. We use those credentials only for connected account workflows you enable, such as account management, token refresh, scheduling, publishing attempts, and analytics.",
      "You may disconnect supported providers or social accounts through the product where available. Some third-party providers may also require you to revoke access directly in their developer or account settings.",
    ],
  },
  {
    icon: Eye,
    iconClass: "text-purple-400",
    title: "6. Payments, Subscriptions, and Creator Credits",
    body: [
      "Payments are processed by third-party processors such as Paystack and PayPal. We do not store full payment card numbers. We may store transaction references, plan IDs, subscription status, checkout status, payment provider metadata, Creator Credit bundle purchases, webhook events, and audit records needed to operate billing and access control.",
      "Creator Credit ledgers may include user ID, feature, provider or model metadata, billing source, credits reserved, credits charged, credits refunded, request status, duration, timestamps, and related diagnostics.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "7. Sharing and Disclosure",
    body: [
      "We do not sell your personal information. We share information only as needed with service providers that help operate SDC, including cloud hosting, Firebase services, payment processors, AI providers, email or notification services, analytics systems, social platform APIs, and support tools.",
      "We may disclose information if required by law, to enforce our terms, to protect users, to investigate fraud or abuse, to respond to lawful requests, or as part of a merger, acquisition, financing, or sale of business assets.",
    ],
  },
  {
    icon: Lock,
    iconClass: "text-primary",
    title: "8. Retention and Deletion",
    body: [
      "We retain data for as long as needed to provide the Services, comply with legal obligations, resolve disputes, enforce agreements, prevent fraud, maintain audit trails, support billing records, and improve reliability.",
      "Generated media, saved artifacts, prompt history, conversation summaries, credit ledgers, publish logs, marketplace purchase records, and webhook/audit logs may be retained even after ordinary UI deletion where necessary for billing, security, compliance, dispute resolution, or operational integrity.",
      "You may request deletion of your account or certain data by contacting support. Some records may be retained when required by law, legitimate business needs, or security obligations.",
    ],
  },
  {
    icon: Eye,
    iconClass: "text-purple-400",
    title: "9. Cookies, Local Storage, Notifications, and Service Workers",
    body: [
      "We use cookies, local storage, session storage, and similar technologies to maintain login sessions, remember preferences, cache onboarding state, support redirects, improve performance, and protect against abuse.",
      "If you enable notifications, we may use browser permissions, Firebase Cloud Messaging, service workers, and device tokens to deliver account, community, subscription, system, publishing, and product notifications. You can control browser notification permissions through your device or browser settings.",
    ],
  },
  {
    icon: Shield,
    iconClass: "text-accent",
    title: "10. Security",
    body: [
      "We use reasonable administrative, technical, and organizational safeguards, including authentication controls, Firestore rules, encrypted credential storage, server-side validation, rate limits, audit logs, and restricted access patterns.",
      "No internet service can guarantee perfect security. You are responsible for using strong passwords, protecting your devices, reviewing connected accounts, and notifying us if you suspect unauthorized access.",
    ],
  },
  {
    icon: Lock,
    iconClass: "text-primary",
    title: "11. Your Rights and Choices",
    body: [
      "Depending on your location, you may have rights to access, correct, delete, export, restrict, or object to certain processing of your personal information. You may also have rights to opt out of certain analytics, marketing, or notification uses.",
      "You can update many account settings directly in the product. For requests that are not available in the UI, contact support. We may need to verify your identity before processing privacy requests.",
    ],
  },
  {
    icon: Eye,
    iconClass: "text-purple-400",
    title: "12. International Processing and Policy Updates",
    body: [
      "Your information may be processed in countries other than where you live, depending on our cloud infrastructure, payment processors, AI providers, and other service providers. Data protection laws may differ by jurisdiction.",
      "We may update this Privacy Policy as SDC evolves. We will update the date above and may notify users of material changes. Continued use of the Services after an update means the revised policy applies.",
      "This policy is intended to explain our data practices in plain language. It should be reviewed by qualified legal counsel before production launch or broad commercial rollout.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col gap-10 py-12 animate-in fade-in duration-700">
        <header className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 cyan-glow">
            <Eye className="text-accent w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold font-headline tracking-tighter">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Last Updated: {updatedAt}</p>
        </header>

        <GlassCard className="p-8 md:p-12 border-accent/20 space-y-8 leading-relaxed">
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

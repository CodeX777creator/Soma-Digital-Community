import Link from "next/link";
import { ArrowRight, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { breadcrumbJsonLd, JsonLd } from "@/lib/seo/structured-data";
import { SITE_CONFIG } from "@/lib/config";

export default function ContactPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-8">
        <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])} />
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/" className="hover:text-white">Home</Link><span className="px-2">/</span><span>Contact</span></nav>
        <header className="space-y-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Contact SDC</p><h1 className="text-4xl font-bold font-headline text-white sm:text-6xl">Get help from the right place.</h1><p className="max-w-2xl text-lg leading-8 text-[#BFC6D4]">Choose the path that matches your question so the SDC team can give you a useful answer.</p></header>
        <div className="grid gap-5 md:grid-cols-3"><ContactCard icon={<LifeBuoy className="h-5 w-5" />} title="Product support" body="For account, Academy, AI Studio, Scheduler, and community help, start in the support area." action="Open support" href="/support" /><ContactCard icon={<Mail className="h-5 w-5" />} title="Email" body="For general questions, contact the SDC team by email." action={SITE_CONFIG.supportEmail} href={`mailto:${SITE_CONFIG.supportEmail}`} /><ContactCard icon={<ShieldCheck className="h-5 w-5" />} title="Privacy requests" body="For privacy or account-data requests, review the policy and use the support channel." action="Read privacy policy" href="/privacy" /></div>
      </div>
    </AppLayout>
  );
}

function ContactCard({ icon, title, body, action, href }: { icon: React.ReactNode; title: string; body: string; action: string; href: string }) {
  return <GlassCard className="flex h-full flex-col p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">{icon}</div><h2 className="mt-5 text-xl font-semibold text-white">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{body}</p><Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-cyan-200">{action}<ArrowRight className="h-4 w-4" /></Link></GlassCard>;
}

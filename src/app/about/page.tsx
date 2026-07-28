import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { JsonLd, breadcrumbJsonLd, organizationJsonLd } from "@/lib/seo/structured-data";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const content = await getSiteContent("about", "about").catch(() => null);
  const title = content?.title || "A calmer operating system for digital business.";
  const summary = content?.summary || "Soma Digital Community brings business planning, AI creation, learning, community, publishing, and digital commerce into one connected workspace for entrepreneurs and creators.";
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/" className="hover:text-white">Home</Link><span className="px-2">/</span><span>About</span></nav>
        <header className="space-y-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">About SDC</p><h1 className="max-w-3xl text-4xl font-bold font-headline text-white sm:text-6xl">{title}</h1><p className="max-w-3xl text-lg leading-8 text-[#BFC6D4]">{summary}</p></header>
        {content?.body ? <GlassCard className="whitespace-pre-wrap p-7 text-base leading-8 text-[#BFC6D4]">{content.body}</GlassCard> : null}
        <div className="grid gap-5 md:grid-cols-3"><AboutCard icon={<Sparkles className="h-5 w-5" />} title="Create with context" body="AI Studio helps turn a clear idea, audience, and goal into practical content and business assets." /><AboutCard icon={<Building2 className="h-5 w-5" />} title="Learn by doing" body="Academy connects lessons, activities, review, certificates, and real business action." /><AboutCard icon={<ShieldCheck className="h-5 w-5" />} title="Stay in control" body="You choose what to generate, what to spend, what to publish, and which workflows to continue." /></div>
        <GlassCard className="p-7"><h2 className="text-2xl font-semibold text-white">Explore the operating system</h2><div className="mt-5 flex flex-wrap gap-3">{[["AI Studio", "/ai/studio"], ["Academy", "/academy"], ["Marketplace", "/marketplace"], ["Pricing", "/pricing"], ["Support", "/support"]].map(([label, href]) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white hover:border-cyan-300/40 hover:text-cyan-200">{label}<ArrowRight className="h-4 w-4" /></Link>)}</div></GlassCard>
      </div>
    </AppLayout>
  );
}

function AboutCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <GlassCard className="p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">{icon}</div><h2 className="mt-5 text-xl font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></GlassCard>;
}

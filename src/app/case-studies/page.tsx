import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ArrowRight, Workflow } from "lucide-react";
import { CASE_STUDIES } from "@/lib/seo/content";
import { listSiteContent, siteContentToArticle } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function CaseStudiesPage() {
  const cmsStudies = await listSiteContent("case_study", true).catch(() => []);
  const studyMap = new Map(CASE_STUDIES.map((study) => [study.slug, study]));
  for (const study of cmsStudies) studyMap.set(study.slug, siteContentToArticle(study));
  const studies = Array.from(studyMap.values());
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Workflows in practice</p>
          <h1 className="text-4xl font-bold font-headline text-white sm:text-5xl">Case Studies</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">See how connected SDC workflows turn learning, ideas, and business context into practical next steps. Product workflow examples are clearly labeled; customer claims are only published when verified.</p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          {studies.map((study) => (
            <GlassCard key={study.slug} className="flex h-full flex-col p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300"><Workflow className="h-4 w-4" />{study.category}</div>
              <h2 className="mt-4 text-2xl font-semibold text-white">{study.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{study.summary}</p>
              <Link href={`/case-studies/${study.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-cyan-200">View workflow <ArrowRight className="h-4 w-4" /></Link>
            </GlassCard>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

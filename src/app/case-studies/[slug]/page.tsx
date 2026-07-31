import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { CASE_STUDIES, getCaseStudy } from "@/lib/seo/content";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/site";
import { articleJsonLd, breadcrumbJsonLd, JsonLd } from "@/lib/seo/structured-data";
import { getSiteContent, siteContentToArticle } from "@/lib/site-content";
import { RichText, stripListMarker } from "@/lib/content/rich-text";
import { formatLongDateSafe } from "@/lib/date-utils";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return CASE_STUDIES.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = siteContentToArticleOrStatic(await getSiteContent("case_study", slug), slug);
  if (!study) return {};
  return buildPageMetadata({ title: `${study.title} | Soma Digital`, description: study.description, path: `/case-studies/${study.slug}`, image: study.image, type: "article", publishedTime: study.publishedAt, modifiedTime: study.updatedAt });
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const study = siteContentToArticleOrStatic(await getSiteContent("case_study", slug), slug);
  if (!study) notFound();
  const url = absoluteUrl(`/case-studies/${study.slug}`);
  return (
    <AppLayout>
      <article className="mx-auto max-w-4xl space-y-8">
        <JsonLd data={articleJsonLd({ headline: study.title, description: study.description, url, author: study.author, datePublished: study.publishedAt, dateModified: study.updatedAt, image: study.image })} />
        <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Case Studies", path: "/case-studies" }, { name: study.title, path: `/case-studies/${study.slug}` }])} />
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Link href="/case-studies" className="inline-flex items-center gap-2 hover:text-white"><ArrowLeft className="h-4 w-4" />Case Studies</Link><span>/</span><span>{study.title}</span></nav>
        <header className="space-y-5"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">{study.category}</p><h1 className="max-w-3xl text-4xl font-bold font-headline text-white sm:text-6xl">{study.title}</h1><p className="max-w-3xl text-lg leading-8 text-[#BFC6D4]">{study.summary}</p><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />Published {formatLongDateSafe(study.publishedAt)} · Updated {formatLongDateSafe(study.updatedAt)}</div>{study.image ? <Image src={study.image} alt={study.title} width={1200} height={630} sizes="(max-width: 896px) 100vw, 896px" className="mt-6 max-h-[460px] w-full rounded-2xl border border-white/10 object-cover" /> : null}</header>
        <div className="space-y-10">{study.sections.map((section) => <section key={section.heading} className="space-y-4"><h2 className="border-b border-white/10 pb-3 text-2xl font-semibold text-white sm:text-3xl">{section.heading}</h2><RichText value={section.body} /></section>)}</div>
        <GlassCard className="border-cyan-400/15 bg-cyan-400/[0.04] p-6"><h2 className="text-lg font-semibold text-white">Key takeaways</h2><ol className="mt-4 list-decimal space-y-3 pl-6 text-sm leading-6 text-[#BFC6D4] marker:font-semibold marker:text-cyan-300">{study.takeaways.map((takeaway) => <li key={takeaway}>{stripListMarker(takeaway)}</li>)}</ol></GlassCard>
        <section className="border-t border-white/[0.08] pt-6"><h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Continue exploring</h2><div className="mt-4 flex flex-wrap gap-3">{[...study.relatedLinks, { label: "Home", href: "/" }, { label: "Get started", href: "/open" }].map((link) => <Link key={`${link.label}-${link.href}`} href={link.href} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white hover:border-cyan-300/40 hover:text-cyan-200">{link.label}<ArrowRight className="h-4 w-4" /></Link>)}</div></section>
      </article>
    </AppLayout>
  );
}

function siteContentToArticleOrStatic(content: Awaited<ReturnType<typeof getSiteContent>>, slug: string) {
  return content ? siteContentToArticle(content) : getCaseStudy(slug);
}

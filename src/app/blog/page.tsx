import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ArrowRight, BookOpenText } from "lucide-react";
import { BLOG_ARTICLES } from "@/lib/seo/content";
import { listSiteContent, siteContentToArticle } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const cmsArticles = await listSiteContent("blog", true).catch(() => []);
  const articleMap = new Map(BLOG_ARTICLES.map((article) => [article.slug, article]));
  for (const article of cmsArticles) articleMap.set(article.slug, siteContentToArticle(article));
  const articles = Array.from(articleMap.values());
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SDC insights</p>
          <h1 className="text-4xl font-bold font-headline text-white sm:text-5xl">Founders Blog</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">Practical ideas for digital entrepreneurs building clearer systems for content, growth, and execution.</p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          {articles.map((article) => (
            <GlassCard key={article.slug} className="flex h-full flex-col p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300"><BookOpenText className="h-4 w-4" />{article.category}</div>
              <h2 className="mt-4 text-2xl font-semibold text-white">{article.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{article.summary}</p>
              <Link href={`/blog/${article.slug}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-cyan-200">Read article <ArrowRight className="h-4 w-4" /></Link>
            </GlassCard>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

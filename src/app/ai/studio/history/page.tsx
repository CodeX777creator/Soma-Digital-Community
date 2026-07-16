"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/clientApi";
import { STUDIO_CONTENT_TYPES, type StudioArtifactRecord, type StudioContentType } from "@/ai/studio/types";
import { ArrowRight, History, Search, Sparkles } from "lucide-react";

type HistoryResponse = {
  supportedContentTypes: readonly StudioContentType[];
  artifacts: StudioArtifactRecord[];
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

export default function StudioHistoryPage() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistoryResponse>({
    supportedContentTypes: STUDIO_CONTENT_TYPES,
    artifacts: [],
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await authFetch("/api/ai/studio?limit=50");
        if (!response.ok) throw new Error("Could not load Studio history.");
        const payload = (await response.json()) as HistoryResponse;
        if (mounted) setData({ supportedContentTypes: payload.supportedContentTypes || STUDIO_CONTENT_TYPES, artifacts: payload.artifacts || [] });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const visibleArtifacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.artifacts.filter((artifact) => {
      if (!term) return true;
      return [artifact.title, artifact.summary, artifact.generatedContent, artifact.contentType, artifact.providerId].join(" ").toLowerCase().includes(term);
    });
  }, [data.artifacts, search]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <section className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-3 py-1 text-xs text-[#BFC6D4]">
                  <History className="h-3.5 w-3.5 text-[#8B5CF6]" />
                  Studio History
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">Generated assets</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#BFC6D4]">
                  Review previous outputs, reuse strong drafts, and turn saved ideas into new Studio workflows.
                </p>
              </div>
              <Button asChild className="rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]">
                <Link href="/ai/studio">
                  <Sparkles className="h-4 w-4" />
                  Create something new
                </Link>
              </Button>
            </div>
          </section>

          <GlassCard className="p-5">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved outputs" className="pl-9" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {visibleArtifacts.map((artifact) => (
                <div key={artifact.artifactId} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-medium text-white">{artifact.title}</h2>
                      <p className="mt-1 text-xs text-[#7E8799]">
                        {formatContentType(artifact.contentType)} · {artifact.promptVersion} · {artifact.providerId}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]">
                      {artifact.source}
                    </Badge>
                  </div>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#BFC6D4]">{artifact.summary || artifact.generatedContent}</p>
                  <Button asChild className="mt-5 rounded-2xl">
                    <Link
                      href={`/ai/studio?${new URLSearchParams({
                        source: "history",
                        contentType: artifact.contentType,
                        businessContext: artifact.generatedContent.slice(0, 1000),
                        goal: "Reuse this saved output and create the next version.",
                      }).toString()}`}
                    >
                      Reuse in Studio
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {!loading && visibleArtifacts.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-dashed border-white/[0.1] p-8 text-sm text-[#BFC6D4]">
                No generated assets found yet.
              </div>
            ) : null}
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

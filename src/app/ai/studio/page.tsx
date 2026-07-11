"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import {
  STUDIO_CONTENT_TYPES,
  type StudioArtifactRecord,
  type StudioContentType,
  type StudioPromptLibraryEntry,
} from "@/ai/studio/types";
import { LibraryBig, Loader2, RefreshCcw, Search, Sparkles, History, FileText, Layers3, ClipboardCopy } from "lucide-react";

type StudioOverviewResponse = {
  supportedContentTypes: readonly StudioContentType[];
  promptLibrary: StudioPromptLibraryEntry[];
  artifacts: StudioArtifactRecord[];
  content?: StudioArtifactRecord | null;
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

export default function AIStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StudioContentType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<StudioOverviewResponse>({
    supportedContentTypes: STUDIO_CONTENT_TYPES,
    promptLibrary: [],
    artifacts: [],
  });

  const loadStudioOverview = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/ai/studio?limit=24", {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Could not load the studio library.");
    }

    return response.json() as Promise<StudioOverviewResponse>;
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const overview = await loadStudioOverview();
        if (mounted && overview) {
          setData({
            supportedContentTypes: overview.supportedContentTypes || STUDIO_CONTENT_TYPES,
            promptLibrary: overview.promptLibrary || [],
            artifacts: overview.artifacts || [],
            content: overview.content || null,
          });
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "Studio library unavailable",
            description: error instanceof Error ? error.message : "We could not load the prompt library right now.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [toast, user]);

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.promptLibrary.filter((entry) => {
      const matchesType = typeFilter === "all" || entry.id === typeFilter;
      if (!query) return matchesType;

      const searchable = [
        entry.title,
        entry.description,
        entry.recommendedFor.join(" "),
        entry.tags.join(" "),
        entry.id,
      ].join(" ").toLowerCase();

      return matchesType && searchable.includes(query);
    });
  }, [data.promptLibrary, search, typeFilter]);

  const visibleArtifacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.artifacts.filter((artifact) => {
      if (typeFilter !== "all" && artifact.contentType !== typeFilter) return false;
      if (!query) return true;
      const searchable = [
        artifact.title,
        artifact.summary,
        artifact.generatedContent,
        artifact.promptKey,
        artifact.promptVersion,
        artifact.providerId,
        artifact.modelId,
        artifact.contentType,
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [data.artifacts, search, typeFilter]);

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    try {
      setRefreshing(true);
      const overview = await loadStudioOverview();
      if (overview) {
        setData({
          supportedContentTypes: overview.supportedContentTypes || STUDIO_CONTENT_TYPES,
          promptLibrary: overview.promptLibrary || [],
          artifacts: overview.artifacts || [],
          content: overview.content || null,
        });
      }
      toast({
        title: "Studio library updated",
        description: "We pulled in the latest prompt packs and generated artifacts.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "The studio library could not be refreshed.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <LibraryBig className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-semibold tracking-tight">AI Studio Library</h1>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Browse reusable prompt packs, review generated studio artifacts, and keep your content system organized in one place.
              </p>
            </div>

            <Button type="button" variant="outline" onClick={handleRefresh} disabled={loading || refreshing || !user}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt packs</p>
              <p className="mt-2 text-2xl font-semibold">{data.promptLibrary.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Ready-to-use content patterns for repeatable work.</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved artifacts</p>
              <p className="mt-2 text-2xl font-semibold">{data.artifacts.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Generated outputs now persist for review and reuse.</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supported modes</p>
              <p className="mt-2 text-2xl font-semibold">{data.supportedContentTypes.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">The studio currently supports these content shapes.</p>
            </GlassCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4">
              <GlassCard className="p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search library</label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search prompts, tags, and artifact titles"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content type</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value as StudioContentType | "all")}
                    >
                      <option value="all">All types</option>
                      {data.supportedContentTypes.map((type) => (
                        <option key={type} value={type}>
                          {formatContentType(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </GlassCard>

              <div className="grid gap-4">
                {filteredPrompts.map((entry) => (
                  <GlassCard key={entry.id} className="p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <h2 className="text-base font-semibold">{entry.title}</h2>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {entry.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="rounded-md">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(entry.title)}>
                          <ClipboardCopy className="h-4 w-4" />
                          Copy title
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4" />
                        <span>{entry.id}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {entry.recommendedFor.map((item) => (
                          <span key={item} className="rounded-md border border-border px-2 py-1 text-xs">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </GlassCard>
                ))}

                {!loading && filteredPrompts.length === 0 ? (
                  <GlassCard className="p-5">
                    <p className="text-sm text-muted-foreground">No prompt packs match this search yet.</p>
                  </GlassCard>
                ) : null}
              </div>
            </section>

            <aside className="space-y-4">
              <GlassCard className="p-5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Recent artifacts</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {visibleArtifacts.map((artifact) => (
                    <div key={artifact.artifactId} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{artifact.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatContentType(artifact.contentType)} · {artifact.promptVersion} · {artifact.providerId}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {artifact.source}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {artifact.summary || artifact.generatedContent}
                      </p>
                    </div>
                  ))}

                  {!loading && visibleArtifacts.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      Saved studio outputs will appear here after generation.
                    </div>
                  ) : null}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Current focus</h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  The studio library is now backed by Firestore, so prompt packs and generated outputs stay available across sessions.
                </p>
              </GlassCard>
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

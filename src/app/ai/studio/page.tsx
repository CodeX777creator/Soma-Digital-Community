"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import {
  STUDIO_CONTENT_TYPES,
  type StudioArtifactRecord,
  type StudioContentType,
  type StudioGenerationResult,
  type StudioPromptLibraryEntry,
  type StudioTone,
} from "@/ai/studio/types";
import {
  ArrowRight,
  ClipboardCopy,
  History,
  Layers3,
  LibraryBig,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  FileText,
} from "lucide-react";

type StudioOverviewResponse = {
  supportedContentTypes: readonly StudioContentType[];
  promptLibrary: StudioPromptLibraryEntry[];
  artifacts: StudioArtifactRecord[];
  content?: StudioGenerationResult | null;
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

const TONE_OPTIONS: StudioTone[] = ["professional", "casual", "encouraging", "direct", "bold", "playful", "premium"];

interface StudioComposerState {
  contentType: StudioContentType;
  businessContext: string;
  targetAudience: string;
  tone: StudioTone;
  platform: string;
  brandName: string;
  brandVoice: string;
  campaignGoal: string;
  callToAction: string;
  keywords: string;
  notes: string;
  language: string;
}

const DEFAULT_COMPOSER_STATE: StudioComposerState = {
  contentType: "script",
  businessContext: "",
  targetAudience: "",
  tone: "professional",
  platform: "",
  brandName: "",
  brandVoice: "",
  campaignGoal: "",
  callToAction: "",
  keywords: "",
  notes: "",
  language: "English",
};

export default function AIStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StudioContentType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [composer, setComposer] = useState<StudioComposerState>(DEFAULT_COMPOSER_STATE);
  const [latestGeneration, setLatestGeneration] = useState<StudioGenerationResult | null>(null);
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
        if (overview.content) {
          setLatestGeneration(overview.content);
        }
      }
      toast({
        title: "Studio refreshed",
        description: "We pulled in the latest prompt packs and generated artifacts.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "The studio workspace could not be refreshed.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleComposerChange = <K extends keyof StudioComposerState>(key: K, value: StudioComposerState[K]) => {
    setComposer((current) => ({ ...current, [key]: value }));
  };

  const handleUsePack = (pack: StudioPromptLibraryEntry) => {
    setComposer((current) => ({
      ...current,
      contentType: pack.id as StudioContentType,
      campaignGoal: current.campaignGoal || pack.description,
      notes: current.notes || `Working from ${pack.title}.`,
    }));
    toast({
      title: "Pack loaded into studio",
      description: `${pack.title} is ready to use as the starting point.`,
    });
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || generating) return;

    try {
      setGenerating(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/studio", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: composer.contentType,
          businessContext: composer.businessContext,
          targetAudience: composer.targetAudience,
          tone: composer.tone,
          platform: composer.platform,
          brandName: composer.brandName,
          brandVoice: composer.brandVoice,
          campaignGoal: composer.campaignGoal,
          callToAction: composer.callToAction,
          keywords: composer.keywords
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          notes: composer.notes,
          language: composer.language,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not generate studio content.");
      }

      setLatestGeneration(payload.content || null);
      if (payload.artifacts) {
        setData((current) => ({
          ...current,
          artifacts: payload.artifacts || current.artifacts,
          promptLibrary: payload.promptLibrary || current.promptLibrary,
        }));
      }

      toast({
        title: "Content generated",
        description: payload.content?.title || "Your studio draft is ready.",
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "We could not generate content right now.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Create content, reuse proven prompt packs, and review generated assets in one workspace. The packs are reference-only helpers now, not the main surface.
              </p>
            </div>

            <Button type="button" variant="outline" onClick={handleRefresh} disabled={loading || refreshing || !user}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt packs</p>
              <p className="mt-2 text-2xl font-semibold">{data.promptLibrary.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Reusable references for repeatable work.</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved artifacts</p>
              <p className="mt-2 text-2xl font-semibold">{data.artifacts.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Generated outputs persist for later reuse.</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supported modes</p>
              <p className="mt-2 text-2xl font-semibold">{data.supportedContentTypes.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">These content shapes are available today.</p>
            </GlassCard>
            <GlassCard className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session output</p>
              <p className="mt-2 truncate text-2xl font-semibold">{latestGeneration?.title || "None yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{latestGeneration ? formatContentType(latestGeneration.contentType) : "Generate something to preview it here."}</p>
            </GlassCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-6">
              <GlassCard className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-semibold">Create content</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose a content shape and feed the studio the business context it needs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers3 className="h-4 w-4" />
                    <span>Prompt packs remain read-only references</span>
                  </div>
                </div>

                <form className="mt-5 space-y-4" onSubmit={handleGenerate}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content type</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={composer.contentType}
                        onChange={(event) => handleComposerChange("contentType", event.target.value as StudioContentType)}
                      >
                        {data.supportedContentTypes.map((type) => (
                          <option key={type} value={type}>
                            {formatContentType(type)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tone</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={composer.tone}
                        onChange={(event) => handleComposerChange("tone", event.target.value as StudioTone)}
                      >
                        {TONE_OPTIONS.map((tone) => (
                          <option key={tone} value={tone}>
                            {tone}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <Input value={composer.platform} onChange={(event) => handleComposerChange("platform", event.target.value)} placeholder="Instagram, YouTube, email..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Business context</label>
                      <Textarea
                        rows={4}
                        value={composer.businessContext}
                        onChange={(event) => handleComposerChange("businessContext", event.target.value)}
                        placeholder="Describe the offer, audience, and business goal."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Target audience</label>
                      <Textarea
                        rows={4}
                        value={composer.targetAudience}
                        onChange={(event) => handleComposerChange("targetAudience", event.target.value)}
                        placeholder="Who this is for and what matters to them."
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand name</label>
                      <Input value={composer.brandName} onChange={(event) => handleComposerChange("brandName", event.target.value)} placeholder="Soma Digital Community" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand voice</label>
                      <Input value={composer.brandVoice} onChange={(event) => handleComposerChange("brandVoice", event.target.value)} placeholder="Premium, direct, helpful..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Campaign goal</label>
                      <Input value={composer.campaignGoal} onChange={(event) => handleComposerChange("campaignGoal", event.target.value)} placeholder="Drive signups, teach value, launch a product..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Call to action</label>
                      <Input value={composer.callToAction} onChange={(event) => handleComposerChange("callToAction", event.target.value)} placeholder="Book a call, buy now, subscribe..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Keywords</label>
                      <Input value={composer.keywords} onChange={(event) => handleComposerChange("keywords", event.target.value)} placeholder="Founder, AI, content, growth" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Language</label>
                      <Input value={composer.language} onChange={(event) => handleComposerChange("language", event.target.value)} placeholder="English" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      rows={3}
                      value={composer.notes}
                      onChange={(event) => handleComposerChange("notes", event.target.value)}
                      placeholder="Any extra instructions, brand rules, or context."
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={generating || loading}>
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate content
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setComposer(DEFAULT_COMPOSER_STATE)} disabled={generating}>
                      Reset
                    </Button>
                  </div>
                </form>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LibraryBig className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">Prompt library</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search packs"
                        className="pl-9"
                      />
                    </div>
                    <select
                      className={cn("h-10 rounded-md border border-input bg-background px-3 text-sm")}
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

                <div className="mt-4 grid gap-4">
                  {filteredPrompts.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border/70 bg-background/40 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">{entry.title}</h3>
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
                          <Button type="button" size="sm" onClick={() => handleUsePack(entry)}>
                            Use in studio
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Layers3 className="h-4 w-4" />
                          <span>{entry.id}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entry.recommendedFor.map((item) => (
                            <span key={item} className="rounded-md border border-border px-2 py-1">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!loading && filteredPrompts.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      No prompt packs match this search yet.
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            </section>

            <aside className="space-y-6">
              <GlassCard className="p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Generation preview</h2>
                </div>
                {latestGeneration ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{formatContentType(latestGeneration.contentType)}</p>
                          <h3 className="mt-1 text-lg font-semibold">{latestGeneration.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{latestGeneration.summary}</p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {latestGeneration.promptVersion}
                        </Badge>
                      </div>

                      <div className="mt-4 rounded-md border border-border/70 bg-background/60 p-4">
                        <pre className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {latestGeneration.generatedContent}
                        </pre>
                      </div>
                    </div>

                    {latestGeneration.strategicTips?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategic tips</p>
                        <div className="grid gap-2">
                          {latestGeneration.strategicTips.map((tip) => (
                            <div key={tip} className="rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                              {tip}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {latestGeneration.variants?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variants</p>
                        <div className="grid gap-2">
                          {latestGeneration.variants.map((variant) => (
                            <div key={variant} className="rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                              {variant}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Generate something from the studio form and the output will render here.
                  </div>
                )}
              </GlassCard>

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
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, History, Loader2, Play, Plus, RotateCcw, Sparkles, Trash2, Video, Wand2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_STYLE_PRESETS,
  type BrandTemplate,
  type VideoAssetRecord,
  type VideoAspectRatio,
  type VideoGenerationResult,
  type VideoStylePreset,
  type VideoScene,
} from "@/ai/studio/types";

type VideoStudioHistoryResponse = {
  capabilities: {
    stylePresets: readonly VideoStylePreset[];
    aspectRatios: readonly VideoAspectRatio[];
    defaultDurationSeconds: number;
  };
  assets: VideoAssetRecord[];
};

type VideoStudioResponse = {
  video: VideoGenerationResult;
};

interface VideoStudioFormState {
  prompt: string;
  promptEdits: string;
  negativePrompt: string;
  stylePreset: VideoStylePreset;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  captionsEnabled: boolean;
  voiceoverTone: string;
  title: string;
  brandName: string;
  brandTemplateName: string;
  brandTemplateNotes: string;
  brandLogoUrl: string;
  brandColors: string;
  brandFonts: string;
  visibility: "private" | "team" | "public";
}

const DEFAULT_PROMPT = "Create a polished business explainer video that makes the audience understand the value quickly and clearly.";

function createSceneDraft(prompt: string, index: number, durationSeconds: number): VideoScene {
  const base = Math.max(4, Math.round(durationSeconds / 3));
  const sceneThemes = [
    {
      visualDescription: `Opening hook that introduces ${prompt.toLowerCase()}`,
      narration: "Set up the problem and why it matters.",
      onScreenText: "Start here",
    },
    {
      visualDescription: "Middle scene showing the workflow, transformation, or proof.",
      narration: "Show the value in motion.",
      onScreenText: "The opportunity",
    },
    {
      visualDescription: "Closing scene with a strong call to action and brand finish.",
      narration: "Invite the viewer to take the next step.",
      onScreenText: "Take action",
    },
  ];

  const template = sceneThemes[index % sceneThemes.length];

  return {
    sceneNumber: index + 1,
    durationSeconds: base,
    visualDescription: template.visualDescription,
    narration: template.narration,
    onScreenText: template.onScreenText,
  };
}

function createDefaultTimeline(prompt: string, durationSeconds: number): VideoScene[] {
  return [0, 1, 2].map((index) => createSceneDraft(prompt, index, durationSeconds));
}

function normalizeTimelineScenes(scenes: VideoScene[]): VideoScene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    sceneNumber: index + 1,
    durationSeconds: Math.max(3, Math.round(scene.durationSeconds || 3)),
    visualDescription: scene.visualDescription || "Business-focused scene",
    narration: scene.narration || "",
    onScreenText: scene.onScreenText || "",
  }));
}

function buildBrandTemplate(form: VideoStudioFormState): BrandTemplate | null {
  const colors = form.brandColors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const fonts = form.brandFonts
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const hasBrandData = form.brandTemplateName || form.brandTemplateNotes || form.brandLogoUrl || colors.length > 0 || fonts.length > 0;

  if (!hasBrandData) return null;

  return {
    name: form.brandTemplateName || undefined,
    description: form.brandTemplateNotes || undefined,
    logoUrl: form.brandLogoUrl || undefined,
    colors: colors.length > 0 ? colors : undefined,
    fonts: fonts.length > 0 ? fonts : undefined,
    notes: form.brandTemplateNotes || undefined,
  };
}

export default function VideoStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<VideoStudioFormState>({
    prompt: DEFAULT_PROMPT,
    promptEdits: "",
    negativePrompt: "",
    stylePreset: "cinematic",
    aspectRatio: "16:9",
    durationSeconds: 30,
    captionsEnabled: true,
    voiceoverTone: "confident and clear",
    title: "",
    brandName: "",
    brandTemplateName: "",
    brandTemplateNotes: "",
    brandLogoUrl: "",
    brandColors: "",
    brandFonts: "",
    visibility: "private",
  });
  const [timelineScenes, setTimelineScenes] = useState<VideoScene[]>(() => createDefaultTimeline(DEFAULT_PROMPT, 30));
  const [history, setHistory] = useState<VideoAssetRecord[]>([]);
  const [latestVideo, setLatestVideo] = useState<VideoGenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const brandTemplate = useMemo(() => buildBrandTemplate(state), [state]);
  const totalTimelineDuration = useMemo(
    () => timelineScenes.reduce((sum, scene) => sum + (Number(scene.durationSeconds) || 0), 0),
    [timelineScenes]
  );

  const loadHistory = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const response = await fetch("/api/ai/video-studio?limit=12", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load video history.");
    }

    const data = (await response.json()) as VideoStudioHistoryResponse;
    setHistory(data.assets || []);
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoadingHistory(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/ai/video-studio?limit=12", {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) {
          throw new Error("Could not load video history.");
        }

        const data = (await response.json()) as VideoStudioHistoryResponse;
        if (mounted) {
          setHistory(data.assets || []);
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "History unavailable",
            description: error instanceof Error ? error.message : "Could not load the video library.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoadingHistory(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [toast, user]);

  const updateField = <K extends keyof VideoStudioFormState>(key: K, value: VideoStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const resetTimeline = () => {
    setTimelineScenes(createDefaultTimeline(state.prompt || DEFAULT_PROMPT, state.durationSeconds));
  };

  const addScene = () => {
    setTimelineScenes((current) => normalizeTimelineScenes([...current, createSceneDraft(state.prompt || DEFAULT_PROMPT, current.length, state.durationSeconds)]));
  };

  const moveScene = (index: number, direction: -1 | 1) => {
    setTimelineScenes((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return normalizeTimelineScenes(next);
    });
  };

  const removeScene = (index: number) => {
    setTimelineScenes((current) => {
      if (current.length <= 1) return current;
      return normalizeTimelineScenes(current.filter((_, itemIndex) => itemIndex !== index));
    });
  };

  const updateScene = <K extends keyof VideoScene>(index: number, key: K, value: VideoScene[K]) => {
    setTimelineScenes((current) =>
      normalizeTimelineScenes(
        current.map((scene, itemIndex) => (itemIndex === index ? { ...scene, [key]: value } : scene))
      )
    );
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/video-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: state.prompt,
          promptEdits: state.promptEdits || undefined,
          negativePrompt: state.negativePrompt || undefined,
          scenes: timelineScenes,
          stylePreset: state.stylePreset,
          aspectRatio: state.aspectRatio,
          durationSeconds: state.durationSeconds,
          captionsEnabled: state.captionsEnabled,
          voiceoverTone: state.voiceoverTone || undefined,
          title: state.title || undefined,
          brandName: state.brandName || undefined,
          brandTemplate: brandTemplate || undefined,
          visibility: state.visibility,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Video generation failed.");
      }

      const data = (await response.json()) as VideoStudioResponse;
      setLatestVideo(data.video);
      if (Array.isArray(data.video.scenes) && data.video.scenes.length > 0) {
        setTimelineScenes(normalizeTimelineScenes(data.video.scenes));
      }
      await loadHistory();
      toast({
        title: "Video prepared",
        description: "Your video asset is ready and saved to the library.",
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "The video studio could not complete this request.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">AI Video Studio</h1>
                <p className="text-sm text-muted-foreground">
                  Shape scripts, captions, and render-ready video packages for your business content.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory || loading}>
                {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                Refresh
              </Button>
            </div>

            <GlassCard className="p-5">
              <form className="space-y-4" onSubmit={handleGenerate}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Prompt</label>
                  <Textarea value={state.prompt} onChange={(event) => updateField("prompt", event.target.value)} rows={5} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prompt edits</label>
                    <Textarea value={state.promptEdits} onChange={(event) => updateField("promptEdits", event.target.value)} rows={3} placeholder="Describe shots, pacing, mood, or format." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Negative prompt</label>
                    <Textarea value={state.negativePrompt} onChange={(event) => updateField("negativePrompt", event.target.value)} rows={3} placeholder="Describe anything to avoid." />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Style preset</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.stylePreset} onChange={(event) => updateField("stylePreset", event.target.value as VideoStylePreset)}>
                      {VIDEO_STYLE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Aspect ratio</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.aspectRatio} onChange={(event) => updateField("aspectRatio", event.target.value as VideoAspectRatio)}>
                      {VIDEO_ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Duration</label>
                    <Input type="number" min={6} max={180} value={state.durationSeconds} onChange={(event) => updateField("durationSeconds", Number(event.target.value) || 30)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voice tone</label>
                    <Input value={state.voiceoverTone} onChange={(event) => updateField("voiceoverTone", event.target.value)} placeholder="Confident and clear" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional video title" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand name</label>
                    <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Optional brand name" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand template name</label>
                    <Input value={state.brandTemplateName} onChange={(event) => updateField("brandTemplateName", event.target.value)} placeholder="Campaign or series name" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand logo URL</label>
                    <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="https://..." />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand colors</label>
                    <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="#0f172a, #2563eb, #eab308" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand fonts</label>
                    <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Inter, Sora, Geist" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Brand template notes</label>
                  <Textarea value={state.brandTemplateNotes} onChange={(event) => updateField("brandTemplateNotes", event.target.value)} rows={3} placeholder="Describe the visual identity, pacing, or audience goals." />
                </div>

                <div className="rounded-md border border-border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Timeline</h3>
                      <p className="text-xs text-muted-foreground">
                        Reorder or edit scenes before generation. Total duration: {totalTimelineDuration}s
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={resetTimeline}>
                        <RotateCcw className="h-4 w-4" />
                        Reset
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={addScene}>
                        <Plus className="h-4 w-4" />
                        Add scene
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {timelineScenes.map((scene, index) => (
                      <div key={`${scene.sceneNumber}-${index}`} className="rounded-md border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Scene {index + 1}</p>
                            <p className="text-xs text-muted-foreground">Timeline order and content</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => moveScene(index, -1)}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => moveScene(index, 1)}
                              disabled={index === timelineScenes.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => removeScene(index)}
                              disabled={timelineScenes.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Duration</label>
                            <Input
                              type="number"
                              min={3}
                              max={180}
                              value={scene.durationSeconds}
                              onChange={(event) => updateScene(index, "durationSeconds", Number(event.target.value) || 3)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">On-screen text</label>
                            <Input
                              value={scene.onScreenText}
                              onChange={(event) => updateScene(index, "onScreenText", event.target.value)}
                              placeholder="Short, legible message"
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Visual description</label>
                            <Textarea
                              rows={3}
                              value={scene.visualDescription}
                              onChange={(event) => updateScene(index, "visualDescription", event.target.value)}
                              placeholder="Describe what the viewer sees."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Narration</label>
                            <Textarea
                              rows={3}
                              value={scene.narration}
                              onChange={(event) => updateScene(index, "narration", event.target.value)}
                              placeholder="Voiceover or spoken line."
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Camera direction</label>
                            <Input
                              value={scene.cameraDirection || ""}
                              onChange={(event) => updateScene(index, "cameraDirection", event.target.value)}
                              placeholder="Slow push-in, static frame, etc."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Transition</label>
                            <Input
                              value={scene.transition || ""}
                              onChange={(event) => updateScene(index, "transition", event.target.value)}
                              placeholder="Cut, fade, swipe, etc."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={state.captionsEnabled}
                      onChange={(event) => updateField("captionsEnabled", event.target.checked)}
                    />
                    Captions enabled
                  </label>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Visibility</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.visibility} onChange={(event) => updateField("visibility", event.target.value as VideoStudioFormState["visibility"])}>
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate video
                </Button>
              </form>
            </GlassCard>
          </section>

          <aside className="space-y-6">
            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Latest asset</h2>
              </div>
              {latestVideo ? (
                <div className="mt-4 space-y-4">
                  <div className="overflow-hidden rounded-md border border-border bg-black/20">
                    {latestVideo.posterFrameUrl ? (
                      <img
                        src={latestVideo.posterFrameUrl}
                        alt={latestVideo.title}
                        className="w-full aspect-video object-cover"
                      />
                    ) : latestVideo.downloadUrl && latestVideo.mimeType.startsWith("video/") ? (
                      <video controls className="w-full aspect-video object-cover" src={latestVideo.downloadUrl} />
                    ) : (
                      <div className="flex aspect-video items-center justify-center p-6 text-sm text-muted-foreground">
                        <div className="space-y-2 text-center">
                          <Play className="mx-auto h-8 w-8 text-primary" />
                          <p>{latestVideo.status === "completed" ? "Video package saved" : "Render queued"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{latestVideo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {latestVideo.stylePreset.replace(/_/g, " ")} · {latestVideo.aspectRatio} · {latestVideo.provider}
                    </p>
                  </div>
                  {latestVideo.downloadUrl ? (
                    <Button asChild variant="outline" className="w-full">
                      <a href={latestVideo.downloadUrl} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  ) : null}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenes</p>
                      <div className="mt-2 space-y-2">
                        {(latestVideo.scenes || []).map((scene: VideoScene) => (
                          <div key={scene.sceneNumber} className="rounded-md border border-border p-3 text-sm">
                            <p className="font-medium">Scene {scene.sceneNumber}</p>
                            <p className="text-xs text-muted-foreground">{scene.durationSeconds}s · {scene.visualDescription}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Generated videos will appear here with a playable preview or render bundle.
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">History</h2>
              </div>
              <div className="mt-4 space-y-3">
                {history.length > 0 ? history.map((asset) => (
                  <div key={asset.assetId} className="flex gap-3 rounded-md border border-border p-3">
                    <div className="h-16 w-16 flex-none overflow-hidden rounded-sm border border-border bg-black/10">
                      {asset.posterFrameUrl ? (
                        <img src={asset.posterFrameUrl} alt={asset.title} className="h-full w-full object-cover" />
                      ) : asset.downloadUrl && asset.status === "completed" ? (
                        <video src={asset.downloadUrl} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/10">
                          <Video className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {asset.stylePreset} · {asset.aspectRatio} · {asset.durationSeconds}s
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {asset.downloadUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    {loadingHistory ? "Loading your video library..." : "No generated videos yet."}
                  </div>
                )}
              </div>
            </GlassCard>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, Headphones, History, Loader2, Music2, Sparkles, Volume2 } from "lucide-react";
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
  AUDIO_LANGUAGES,
  AUDIO_VOICE_PRESETS,
  type AudioAssetRecord,
  type AudioLanguage,
  type AudioVoicePreset,
  type AudioVoiceProfile,
  type BrandTemplate,
} from "@/ai/studio/types";

type AudioStudioHistoryResponse = {
  capabilities: {
    voicePresets: readonly AudioVoicePreset[];
    languages: readonly string[];
    defaultDurationSeconds: number;
  };
  assets: AudioAssetRecord[];
};

type AudioStudioResponse = {
  audio: {
    assetId: string;
    title: string;
    prompt: string;
    narrationText: string;
    transcript?: string;
    voicePreset: AudioVoicePreset;
    voiceId: string;
    secondaryVoiceId?: string;
    language: string;
    backgroundMusic: boolean;
    includeIntro: boolean;
    includeOutro: boolean;
    durationSeconds: number;
    tone?: string;
    scriptStyle?: string;
    brandTemplate?: BrandTemplate | null;
    brandName?: string;
    storagePath: string;
    thumbnail: string;
    provider: string;
    model: string;
    promptVersion: string;
    visibility: "private" | "team" | "public";
    tags: string[];
    checksum: string;
    status: "completed" | "queued" | "failed";
    renderState: "completed" | "queued" | "failed";
    downloadUrl?: string;
    mimeType: string;
    durationMs: number;
    promptPreview: string;
    synthesisText: string;
  };
};

interface AudioStudioFormState {
  prompt: string;
  narrationText: string;
  transcript: string;
  voicePreset: AudioVoicePreset;
  voiceId: string;
  secondaryVoiceId: string;
  language: string;
  backgroundMusic: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  durationSeconds: number;
  title: string;
  brandName: string;
  brandTemplateName: string;
  brandTemplateNotes: string;
  brandLogoUrl: string;
  brandColors: string;
  brandFonts: string;
  tone: string;
  scriptStyle: string;
  visibility: "private" | "team" | "public";
}

const DEFAULT_PROMPT = "Create a clear, persuasive voiceover for a business offer that sounds natural, trustworthy, and ready for publishing.";

function buildVoiceProfile(form: AudioStudioFormState): AudioVoiceProfile | null {
  const hasData = form.voiceId || form.secondaryVoiceId || form.voicePreset;
  if (!hasData) return null;
  return {
    voiceId: form.voiceId || undefined,
    name: form.voicePreset,
    description: `${form.voicePreset} voice profile`,
    language: form.language as AudioLanguage,
    stability: 0.45,
    similarityBoost: 0.8,
    speed: 1,
  };
}

function buildBrandTemplate(form: AudioStudioFormState): BrandTemplate | null {
  const colors = form.brandColors.split(",").map((value) => value.trim()).filter(Boolean);
  const fonts = form.brandFonts.split(",").map((value) => value.trim()).filter(Boolean);
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

export default function AudioStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<AudioStudioFormState>({
    prompt: DEFAULT_PROMPT,
    narrationText: "",
    transcript: "",
    voicePreset: "narrator",
    voiceId: "",
    secondaryVoiceId: "",
    language: "English",
    backgroundMusic: false,
    includeIntro: true,
    includeOutro: true,
    durationSeconds: 30,
    title: "",
    brandName: "",
    brandTemplateName: "",
    brandTemplateNotes: "",
    brandLogoUrl: "",
    brandColors: "",
    brandFonts: "",
    tone: "confident and clear",
    scriptStyle: "commercial",
    visibility: "private",
  });
  const [history, setHistory] = useState<AudioAssetRecord[]>([]);
  const [latestAudio, setLatestAudio] = useState<AudioStudioResponse["audio"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const brandTemplate = useMemo(() => buildBrandTemplate(state), [state]);
  const voiceProfile = useMemo(() => buildVoiceProfile(state), [state]);

  const loadHistory = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const response = await fetch("/api/ai/audio-studio?limit=12", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load audio history.");
    }

    const data = (await response.json()) as AudioStudioHistoryResponse;
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
        const response = await fetch("/api/ai/audio-studio?limit=12", {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) {
          throw new Error("Could not load audio history.");
        }

        const data = (await response.json()) as AudioStudioHistoryResponse;
        if (mounted) {
          setHistory(data.assets || []);
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "History unavailable",
            description: error instanceof Error ? error.message : "Could not load the audio library.",
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

  const updateField = <K extends keyof AudioStudioFormState>(key: K, value: AudioStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/audio-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: state.prompt,
          narrationText: state.narrationText || undefined,
          transcript: state.transcript || undefined,
          title: state.title || undefined,
          voicePreset: state.voicePreset,
          voiceId: state.voiceId || undefined,
          secondaryVoiceId: state.secondaryVoiceId || undefined,
          language: state.language,
          backgroundMusic: state.backgroundMusic,
          includeIntro: state.includeIntro,
          includeOutro: state.includeOutro,
          durationSeconds: state.durationSeconds,
          brandName: state.brandName || undefined,
          brandTemplate: brandTemplate || undefined,
          tone: state.tone || undefined,
          scriptStyle: state.scriptStyle || undefined,
          visibility: state.visibility,
          voiceProfile: voiceProfile || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Audio generation failed.");
      }

      const data = (await response.json()) as AudioStudioResponse;
      setLatestAudio(data.audio);
      await loadHistory();
      toast({
        title: "Audio prepared",
        description: "Your voice asset is ready and saved to the library.",
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "The audio studio could not complete this request.",
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
                <h1 className="text-2xl font-semibold tracking-tight">AI Audio Studio</h1>
                <p className="text-sm text-muted-foreground">
                  Create narrated voice assets with multilingual support, reusable voices, and saved history.
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
                  <Textarea value={state.prompt} onChange={(event) => updateField("prompt", event.target.value)} rows={4} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Narration text</label>
                    <Textarea value={state.narrationText} onChange={(event) => updateField("narrationText", event.target.value)} rows={5} placeholder="Optional, if you want to control the exact voiceover." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Transcript</label>
                    <Textarea value={state.transcript} onChange={(event) => updateField("transcript", event.target.value)} rows={5} placeholder="Optional supporting transcript or alternate copy." />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voice preset</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.voicePreset} onChange={(event) => updateField("voicePreset", event.target.value as AudioVoicePreset)}>
                      {AUDIO_VOICE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voice ID</label>
                    <Input value={state.voiceId} onChange={(event) => updateField("voiceId", event.target.value)} placeholder="Optional ElevenLabs voice ID" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Secondary voice ID</label>
                    <Input value={state.secondaryVoiceId} onChange={(event) => updateField("secondaryVoiceId", event.target.value)} placeholder="Optional second speaker voice ID" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.language} onChange={(event) => updateField("language", event.target.value)}>
                      {AUDIO_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Duration</label>
                    <Input type="number" min={6} max={600} value={state.durationSeconds} onChange={(event) => updateField("durationSeconds", Number(event.target.value) || 30)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tone</label>
                    <Input value={state.tone} onChange={(event) => updateField("tone", event.target.value)} placeholder="Confident and clear" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Script style</label>
                    <Input value={state.scriptStyle} onChange={(event) => updateField("scriptStyle", event.target.value)} placeholder="Commercial, educational, etc." />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional audio title" />
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
                  <Textarea value={state.brandTemplateNotes} onChange={(event) => updateField("brandTemplateNotes", event.target.value)} rows={3} placeholder="Describe the sound, pace, or audience goals." />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={state.backgroundMusic} onChange={(event) => updateField("backgroundMusic", event.target.checked)} />
                    Background music
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={state.includeIntro} onChange={(event) => updateField("includeIntro", event.target.checked)} />
                      Include intro
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={state.includeOutro} onChange={(event) => updateField("includeOutro", event.target.checked)} />
                      Include outro
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={state.visibility === "public"}
                      onChange={(event) => updateField("visibility", event.target.checked ? "public" : "private")}
                    />
                    Public visibility
                  </label>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Visibility</label>
                    <select className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} value={state.visibility} onChange={(event) => updateField("visibility", event.target.value as AudioStudioFormState["visibility"])}>
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate audio
                </Button>
              </form>
            </GlassCard>
          </section>

          <aside className="space-y-6">
            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Headphones className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Latest asset</h2>
              </div>
              {latestAudio ? (
                <div className="mt-4 space-y-4">
                  {latestAudio.downloadUrl ? (
                    <audio controls className="w-full" src={latestAudio.downloadUrl} />
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      Audio package saved. Download the bundle from history.
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="font-medium">{latestAudio.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {latestAudio.voicePreset} · {latestAudio.language} · {latestAudio.provider}
                    </p>
                  </div>
                  {latestAudio.downloadUrl ? (
                    <Button asChild variant="outline" className="w-full">
                      <a href={latestAudio.downloadUrl} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  ) : null}
                  <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      <span className="font-medium">Narration</span>
                    </div>
                    <p className="text-muted-foreground">{latestAudio.narrationText}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Generated audio will appear here with playback and a signed download link.
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">History</h2>
              </div>
              <div className="mt-4 space-y-3">
                {history.length > 0 ? history.map((asset) => (
                  <div key={asset.assetId} className="rounded-md border border-border p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-border bg-black/10">
                        <Headphones className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{asset.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {asset.voicePreset} · {asset.language} · {asset.durationSeconds}s
                        </p>
                        {asset.downloadUrl ? (
                          <div className="mt-3 flex items-center gap-2">
                            <audio controls className="w-full" src={asset.downloadUrl} />
                            <Button asChild size="sm" variant="outline">
                              <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Bundle available in storage.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    {loadingHistory ? "Loading your audio library..." : "No generated audio yet."}
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

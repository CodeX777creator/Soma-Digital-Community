"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  type BrandTemplate,
  type ProductRules,
  type VoiceBrandProfile,
  type AudioTranscriptSegment,
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
    productRules?: ProductRules | null;
    voiceBrandProfile?: VoiceBrandProfile | null;
    waveformPreviewUrl?: string;
    transcriptSegments?: AudioTranscriptSegment[];
    renderStrategy?: "ffmpeg" | "cloud" | "bundle";
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
  productName: string;
  productCategory: string;
  productPromise: string;
  targetAudience: string;
  differentiators: string;
  proofPoints: string;
  prohibitedClaims: string;
  complianceNotes: string;
  preferredCallToAction: string;
  brandTone: string;
  voiceBrandProfileName: string;
  voiceBrandProfileDescription: string;
  voiceBrandProfileProvider: string;
  voiceBrandProfileSource: string;
  voiceBrandProfileAccent: string;
  voiceBrandProfileUsageNotes: string;
  voiceBrandProfileCloneConsentConfirmed: boolean;
  tone: string;
  scriptStyle: string;
  visibility: "private" | "team" | "public";
}

const DEFAULT_PROMPT = "Create a clear, persuasive voiceover for a business offer that sounds natural, trustworthy, and ready for publishing.";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildProductRules(form: AudioStudioFormState): ProductRules | null {
  const differentiators = splitList(form.differentiators);
  const proofPoints = splitList(form.proofPoints);
  const prohibitedClaims = splitList(form.prohibitedClaims);
  const hasData =
    form.productName ||
    form.productCategory ||
    form.productPromise ||
    form.targetAudience ||
    differentiators.length > 0 ||
    proofPoints.length > 0 ||
    prohibitedClaims.length > 0 ||
    form.complianceNotes ||
    form.preferredCallToAction ||
    form.brandTone;

  if (!hasData) return null;

  return {
    productName: form.productName || undefined,
    productCategory: form.productCategory || undefined,
    productPromise: form.productPromise || undefined,
    targetAudience: form.targetAudience || undefined,
    differentiators: differentiators.length > 0 ? differentiators : undefined,
    proofPoints: proofPoints.length > 0 ? proofPoints : undefined,
    prohibitedClaims: prohibitedClaims.length > 0 ? prohibitedClaims : undefined,
    complianceNotes: form.complianceNotes || undefined,
    preferredCallToAction: form.preferredCallToAction || undefined,
    brandTone: form.brandTone || undefined,
  };
}

function buildVoiceBrandProfile(form: AudioStudioFormState): VoiceBrandProfile | null {
  const hasData =
    form.voiceId ||
    form.secondaryVoiceId ||
    form.voicePreset ||
    form.voiceBrandProfileName ||
    form.voiceBrandProfileDescription ||
    form.voiceBrandProfileProvider ||
    form.voiceBrandProfileSource ||
    form.voiceBrandProfileAccent ||
    form.voiceBrandProfileUsageNotes;

  if (!hasData) return null;

  return {
    voiceId: form.voiceId || undefined,
    name: form.voicePreset || form.voiceBrandProfileName || "narrator",
    profileName: form.voiceBrandProfileName || form.voicePreset || "narrator",
    description: form.voiceBrandProfileDescription || `${form.voicePreset || "Narrator"} voice profile`,
    provider: form.voiceBrandProfileProvider || undefined,
    isClonedVoice: Boolean(form.voiceBrandProfileSource || form.voiceId),
    cloneSourceName: form.voiceBrandProfileSource || undefined,
    cloneConsentConfirmed: form.voiceBrandProfileCloneConsentConfirmed,
    accent: form.voiceBrandProfileAccent || undefined,
    brandTone: form.brandTone || undefined,
    usageNotes: form.voiceBrandProfileUsageNotes || undefined,
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
    productName: "",
    productCategory: "",
    productPromise: "",
    targetAudience: "",
    differentiators: "",
    proofPoints: "",
    prohibitedClaims: "",
    complianceNotes: "",
    preferredCallToAction: "",
    brandTone: "",
    voiceBrandProfileName: "",
    voiceBrandProfileDescription: "",
    voiceBrandProfileProvider: "",
    voiceBrandProfileSource: "",
    voiceBrandProfileAccent: "",
    voiceBrandProfileUsageNotes: "",
    voiceBrandProfileCloneConsentConfirmed: false,
    tone: "confident and clear",
    scriptStyle: "commercial",
    visibility: "private",
  });
  const [history, setHistory] = useState<AudioAssetRecord[]>([]);
  const [latestAudio, setLatestAudio] = useState<AudioStudioResponse["audio"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);

  const brandTemplate = useMemo(() => buildBrandTemplate(state), [state]);
  const productRules = useMemo(() => buildProductRules(state), [state]);
  const voiceBrandProfile = useMemo(() => buildVoiceBrandProfile(state), [state]);
  const transcriptSegments = latestAudio?.transcriptSegments || [];
  const activeTranscriptIndex = useMemo(() => {
    if (!transcriptSegments.length) return -1;
    return transcriptSegments.findIndex((segment, index) => {
      const next = transcriptSegments[index + 1];
      const isLast = !next;
      return playbackTimeMs >= segment.startMs && (isLast || playbackTimeMs < next.startMs);
    });
  }, [playbackTimeMs, transcriptSegments]);

  const waveformAlt = latestAudio
    ? `Waveform preview for ${latestAudio.title}`
    : "Waveform preview";

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

  const handleAudioTimeUpdate = () => {
    const current = audioRef.current;
    if (!current) return;
    setPlaybackTimeMs(Math.round(current.currentTime * 1000));
  };

  const handleAudioLoaded = () => {
    const current = audioRef.current;
    if (!current) return;
    setPlaybackTimeMs(Math.round(current.currentTime * 1000));
  };

  const handleAudioEnded = () => {
    setPlaybackTimeMs(0);
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
          productRules: productRules || undefined,
          tone: state.tone || undefined,
          scriptStyle: state.scriptStyle || undefined,
          visibility: state.visibility,
          voiceBrandProfile: voiceBrandProfile || undefined,
          voiceProfile: voiceBrandProfile || undefined,
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
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-5 shadow-2xl shadow-black/30 backdrop-blur md:p-8">
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                  <Headphones className="h-3.5 w-3.5 text-[#4F9DFF]" />
                  Narration, multilingual voice, waveform previews
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">AI Audio Studio</h1>
                <p className="max-w-2xl text-sm leading-6 text-[#BFC6D4] md:text-base">
                  Create narrated voice assets with reusable voice profiles, multilingual support, transcript highlighting, and saved history.
                </p>
              </div>
              <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Current focus</p>
                <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">
                  Use one voice identity across campaigns, keep transcripts readable, and preserve downloadable render bundles.
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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

                <div className="rounded-md border border-border p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Product rules</h3>
                    <p className="text-xs text-muted-foreground">
                      Keep the generated content aligned with the product promise and the claims we want to avoid.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Product name</label>
                      <Input value={state.productName} onChange={(event) => updateField("productName", event.target.value)} placeholder="Product or offer name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Category</label>
                      <Input value={state.productCategory} onChange={(event) => updateField("productCategory", event.target.value)} placeholder="Course, membership, service, app..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product promise</label>
                    <Textarea value={state.productPromise} onChange={(event) => updateField("productPromise", event.target.value)} rows={3} placeholder="What outcome should the audience expect?" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Target audience</label>
                      <Textarea value={state.targetAudience} onChange={(event) => updateField("targetAudience", event.target.value)} rows={3} placeholder="Who this is for and why they care." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Preferred CTA</label>
                      <Textarea value={state.preferredCallToAction} onChange={(event) => updateField("preferredCallToAction", event.target.value)} rows={3} placeholder="What should the listener do next?" />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Differentiators</label>
                      <Textarea value={state.differentiators} onChange={(event) => updateField("differentiators", event.target.value)} rows={3} placeholder="Comma-separated differentiators" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Proof points</label>
                      <Textarea value={state.proofPoints} onChange={(event) => updateField("proofPoints", event.target.value)} rows={3} placeholder="Comma-separated proof points" />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Prohibited claims</label>
                      <Textarea value={state.prohibitedClaims} onChange={(event) => updateField("prohibitedClaims", event.target.value)} rows={3} placeholder="Comma-separated claims to avoid" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Compliance notes</label>
                      <Textarea value={state.complianceNotes} onChange={(event) => updateField("complianceNotes", event.target.value)} rows={3} placeholder="Any legal, regulatory, or brand guardrails." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand tone</label>
                    <Input value={state.brandTone} onChange={(event) => updateField("brandTone", event.target.value)} placeholder="Premium, direct, friendly, etc." />
                  </div>
                </div>

                <div className="rounded-md border border-border p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Voice cloning and branding profile</h3>
                    <p className="text-xs text-muted-foreground">
                      Use this for a branded voice, cloned voice, or a reusable narration identity.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Profile name</label>
                      <Input value={state.voiceBrandProfileName} onChange={(event) => updateField("voiceBrandProfileName", event.target.value)} placeholder="Brand narrator or campaign voice" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Provider</label>
                      <Input value={state.voiceBrandProfileProvider} onChange={(event) => updateField("voiceBrandProfileProvider", event.target.value)} placeholder="ElevenLabs, OpenAI, etc." />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Voice source / clone base</label>
                      <Input value={state.voiceBrandProfileSource} onChange={(event) => updateField("voiceBrandProfileSource", event.target.value)} placeholder="Original voice, talent name, or reference" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Accent</label>
                      <Input value={state.voiceBrandProfileAccent} onChange={(event) => updateField("voiceBrandProfileAccent", event.target.value)} placeholder="Neutral, British, Kenyan English..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Profile description</label>
                    <Textarea value={state.voiceBrandProfileDescription} onChange={(event) => updateField("voiceBrandProfileDescription", event.target.value)} rows={3} placeholder="Describe the delivery, tone, and pacing." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Usage notes</label>
                    <Textarea value={state.voiceBrandProfileUsageNotes} onChange={(event) => updateField("voiceBrandProfileUsageNotes", event.target.value)} rows={3} placeholder="Where and how this voice should be used." />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={state.voiceBrandProfileCloneConsentConfirmed}
                      onChange={(event) => updateField("voiceBrandProfileCloneConsentConfirmed", event.target.checked)}
                    />
                    Clone consent confirmed
                  </label>
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
                  {latestAudio.waveformPreviewUrl ? (
                    <div className="overflow-hidden rounded-md border border-border bg-black/20">
                      <img
                        src={latestAudio.waveformPreviewUrl}
                        alt={waveformAlt}
                        className="w-full aspect-[5/1] object-cover"
                      />
                    </div>
                  ) : null}
                  {latestAudio.downloadUrl ? (
                    <audio
                      ref={audioRef}
                      controls
                      className="w-full"
                      src={latestAudio.downloadUrl}
                      onTimeUpdate={handleAudioTimeUpdate}
                      onLoadedMetadata={handleAudioLoaded}
                      onEnded={handleAudioEnded}
                    />
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
                  <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">Transcript</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {latestAudio.renderStrategy === "ffmpeg"
                          ? "Processed locally"
                          : latestAudio.renderStrategy === "cloud"
                            ? "Processed in the cloud"
                            : "Saved as bundle"}
                      </span>
                    </div>
                    {transcriptSegments.length > 0 ? (
                      <div className="space-y-2">
                        {transcriptSegments.map((segment, index) => {
                          const active = index === activeTranscriptIndex;
                          return (
                            <div
                              key={`${segment.index}-${segment.startMs}`}
                              className={cn(
                                "rounded-md border px-3 py-2 transition-colors",
                                active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background/50 text-muted-foreground"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span>Line {index + 1}</span>
                                <span>
                                  {Math.max(0, Math.floor(segment.startMs / 1000))}s - {Math.max(0, Math.floor(segment.endMs / 1000))}s
                                </span>
                              </div>
                              <p className="mt-1 leading-relaxed">{segment.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No transcript segments were generated for this asset.</p>
                    )}
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
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-sm border border-border bg-black/10">
                        {asset.waveformPreviewUrl ? (
                          <img src={asset.waveformPreviewUrl} alt={asset.title} className="h-full w-full object-cover" />
                        ) : (
                          <Headphones className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{asset.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {asset.voicePreset} · {asset.language} · {asset.durationSeconds}s
                        </p>
                        {Array.isArray(asset.transcriptSegments) && asset.transcriptSegments.length > 0 ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {asset.transcriptSegments.slice(0, 2).map((segment) => segment.text).join(" ")}
                          </p>
                        ) : null}
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
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

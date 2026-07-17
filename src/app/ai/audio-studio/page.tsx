"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Headphones,
  Languages,
  Library,
  Loader2,
  Mic2,
  Music2,
  Play,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Video,
  Volume2,
  Wand2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { parseApiError } from "@/lib/clientApi";
import { showErrorToast } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import { estimateAudioCreatorCredits, formatCreatorCreditEstimate } from "@/lib/ai-credit-estimates";
import {
  AUDIO_LANGUAGES,
  type AudioAssetRecord,
  type AudioLanguage,
  type AudioTranscriptSegment,
  type AudioVoicePreset,
  type BrandTemplate,
  type ProductRules,
  type VoiceBrandProfile,
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
    credits?: number;
    creditsReserved?: number;
    creditsRefunded?: number;
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

type AudioTypeId =
  | "video_voiceover"
  | "course_narration"
  | "ad_voiceover"
  | "podcast_intro"
  | "product_explainer"
  | "audio_lesson"
  | "multilingual_message"
  | "brand_announcement";

type VoiceStyleId =
  | "warm_coach"
  | "premium_narrator"
  | "energetic_promo"
  | "calm_teacher"
  | "founder_story"
  | "professional_explainer";

type OutputTab = "preview" | "script" | "transcript" | "captions" | "voice" | "download" | "use";
type MobileStep = "type" | "script" | "audience" | "voice" | "advanced" | "output";

interface AudioStudioFormState {
  audioType: AudioTypeId;
  idea: string;
  exactScript: string;
  targetAudience: string;
  voiceStyle: VoiceStyleId;
  voicePreset: AudioVoicePreset;
  language: string;
  title: string;
  brandName: string;
  preferredCallToAction: string;
  tone: string;
  scriptStyle: string;
  durationSeconds: number;
  transcript: string;
  voiceId: string;
  secondaryVoiceId: string;
  voiceBrandProfileName: string;
  voiceBrandProfileDescription: string;
  voiceBrandProfileProvider: string;
  voiceBrandProfileSource: string;
  voiceBrandProfileAccent: string;
  voiceBrandProfileUsageNotes: string;
  voiceBrandProfileCloneConsentConfirmed: boolean;
  backgroundMusic: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  visibility: "private" | "team" | "public";
  brandTemplateName: string;
  brandTemplateNotes: string;
  brandLogoUrl: string;
  brandColors: string;
  brandFonts: string;
  productName: string;
  productCategory: string;
  productPromise: string;
  differentiators: string;
  proofPoints: string;
  prohibitedClaims: string;
  complianceNotes: string;
  brandTone: string;
}

const AUDIO_TYPES: Array<{
  id: AudioTypeId;
  title: string;
  description: string;
  icon: typeof Video;
  intelligence: string[];
  defaults: Partial<AudioStudioFormState>;
}> = [
  {
    id: "video_voiceover",
    title: "Video voiceover",
    description: "Narration for Reels, Shorts, TikTok, or product videos.",
    icon: Video,
    intelligence: ["Short hook", "Punchy pacing", "Caption-friendly script", "Send to Video Studio"],
    defaults: { voiceStyle: "energetic_promo", voicePreset: "energetic", scriptStyle: "short-form video voiceover", durationSeconds: 45, includeIntro: false, includeOutro: true },
  },
  {
    id: "course_narration",
    title: "Course narration",
    description: "Teacher-style audio for lessons, modules, and Academy content.",
    icon: Headphones,
    intelligence: ["Teacher tone", "Sectioned explanation", "Transcript-first", "Slower pacing"],
    defaults: { voiceStyle: "calm_teacher", voicePreset: "calm", scriptStyle: "course narration", durationSeconds: 120, includeIntro: true, includeOutro: true },
  },
  {
    id: "ad_voiceover",
    title: "Ad voiceover",
    description: "Hook, benefit, proof, and CTA for paid or organic ads.",
    icon: Radio,
    intelligence: ["Hook", "Benefit", "Proof", "CTA"],
    defaults: { voiceStyle: "energetic_promo", voicePreset: "confident", scriptStyle: "conversion ad voiceover", durationSeconds: 30, includeIntro: false, includeOutro: true },
  },
  {
    id: "podcast_intro",
    title: "Podcast intro",
    description: "A branded intro or segment opener with a confident welcome.",
    icon: Mic2,
    intelligence: ["Branded welcome", "Confident tone", "Concise positioning", "Memorable close"],
    defaults: { voiceStyle: "premium_narrator", voicePreset: "premium", scriptStyle: "podcast intro", durationSeconds: 25, includeIntro: false, includeOutro: false },
  },
  {
    id: "product_explainer",
    title: "Product explainer",
    description: "Explain what your offer does and why it matters.",
    icon: Sparkles,
    intelligence: ["Problem", "Solution", "Outcome", "Clear business language"],
    defaults: { voiceStyle: "professional_explainer", voicePreset: "confident", scriptStyle: "product explainer", durationSeconds: 60, includeIntro: true, includeOutro: true },
  },
  {
    id: "audio_lesson",
    title: "Audio lesson",
    description: "A polished teaching segment students can listen to.",
    icon: FileText,
    intelligence: ["Learning objective", "Simple examples", "Key takeaways", "Practice prompt"],
    defaults: { voiceStyle: "calm_teacher", voicePreset: "narrator", scriptStyle: "audio lesson", durationSeconds: 180, includeIntro: true, includeOutro: true },
  },
  {
    id: "multilingual_message",
    title: "Multilingual message",
    description: "Create a clear message for another language or market.",
    icon: Languages,
    intelligence: ["Language first", "Translation-aware copy", "Preserve meaning", "Local clarity"],
    defaults: { voiceStyle: "warm_coach", voicePreset: "warm", scriptStyle: "multilingual business message", durationSeconds: 45, includeIntro: false, includeOutro: true },
  },
  {
    id: "brand_announcement",
    title: "Brand announcement",
    description: "Launch updates, event notices, and community announcements.",
    icon: Volume2,
    intelligence: ["Clear announcement", "Brand warmth", "Important details", "Next step"],
    defaults: { voiceStyle: "premium_narrator", voicePreset: "premium", scriptStyle: "brand announcement", durationSeconds: 45, includeIntro: true, includeOutro: true },
  },
];

const VOICE_STYLES: Array<{
  id: VoiceStyleId;
  label: string;
  preset: AudioVoicePreset;
  tone: string;
  description: string;
}> = [
  { id: "warm_coach", label: "Warm Coach", preset: "warm", tone: "warm, encouraging, and clear", description: "Friendly guidance that feels personal." },
  { id: "premium_narrator", label: "Premium Narrator", preset: "premium", tone: "polished, calm, and premium", description: "Refined delivery for brand moments." },
  { id: "energetic_promo", label: "Energetic Promo", preset: "energetic", tone: "energetic, concise, and persuasive", description: "Best for short ads and social videos." },
  { id: "calm_teacher", label: "Calm Teacher", preset: "calm", tone: "patient, educational, and structured", description: "Great for lessons and explanations." },
  { id: "founder_story", label: "Founder Story", preset: "conversational", tone: "human, reflective, and direct", description: "A natural voice for personal stories." },
  { id: "professional_explainer", label: "Professional Explainer", preset: "confident", tone: "confident, practical, and business-focused", description: "Clear authority without sounding stiff." },
];

const DEFAULT_STATE: AudioStudioFormState = {
  audioType: "video_voiceover",
  idea: "Create a clear voiceover about the benefits of digital marketing for entrepreneurs.",
  exactScript: "",
  targetAudience: "",
  voiceStyle: "energetic_promo",
  voicePreset: "energetic",
  language: "English",
  title: "",
  brandName: "Soma Digital Community",
  preferredCallToAction: "",
  tone: "energetic, concise, and persuasive",
  scriptStyle: "short-form video voiceover",
  durationSeconds: 45,
  transcript: "",
  voiceId: "",
  secondaryVoiceId: "",
  voiceBrandProfileName: "",
  voiceBrandProfileDescription: "",
  voiceBrandProfileProvider: "",
  voiceBrandProfileSource: "",
  voiceBrandProfileAccent: "",
  voiceBrandProfileUsageNotes: "",
  voiceBrandProfileCloneConsentConfirmed: false,
  backgroundMusic: false,
  includeIntro: false,
  includeOutro: true,
  visibility: "private",
  brandTemplateName: "",
  brandTemplateNotes: "",
  brandLogoUrl: "",
  brandColors: "",
  brandFonts: "",
  productName: "",
  productCategory: "",
  productPromise: "",
  differentiators: "",
  proofPoints: "",
  prohibitedClaims: "",
  complianceNotes: "",
  brandTone: "",
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAudioType(id: AudioTypeId) {
  return AUDIO_TYPES.find((type) => type.id === id) || AUDIO_TYPES[0];
}

function getVoiceStyle(id: VoiceStyleId) {
  return VOICE_STYLES.find((style) => style.id === id) || VOICE_STYLES[0];
}

function getAudioTypeInstruction(id: AudioTypeId): string {
  switch (id) {
    case "video_voiceover":
      return "Structure the audio as a short social video voiceover: strong hook, one clear idea, punchy pacing, caption-friendly sentences, and a natural handoff to Video Studio.";
    case "course_narration":
      return "Structure the audio as a course narration: calm teacher tone, sectioned explanation, clear transitions, slower pacing, and explicit key takeaways.";
    case "ad_voiceover":
      return "Structure the audio as an ad voiceover: hook, benefit, proof, call to action. Keep it short, energetic, and conversion-focused without overclaiming.";
    case "podcast_intro":
      return "Structure the audio as a branded podcast intro: warm welcome, positioning statement, concise promise, and memorable close.";
    case "product_explainer":
      return "Structure the audio as a product explainer: problem, solution, outcome, proof, and clear next step in practical business language.";
    case "audio_lesson":
      return "Structure the audio as an audio lesson: learning objective, explanation, example, recap, and a short practice prompt.";
    case "multilingual_message":
      return "Structure the audio as a multilingual message: prioritize meaning over literal wording, use simple culturally clear phrasing, and avoid idioms that translate poorly.";
    case "brand_announcement":
      return "Structure the audio as a brand announcement: what is happening, why it matters, important details, and what listeners should do next.";
    default:
      return "Create a polished audio asset that sounds natural and ready to publish.";
  }
}

function buildPrompt(form: AudioStudioFormState): string {
  const type = getAudioType(form.audioType);
  const style = getVoiceStyle(form.voiceStyle);
  const source = form.exactScript.trim()
    ? `Use this exact script as the foundation and only improve clarity where necessary:\n${form.exactScript.trim()}`
    : form.idea.trim();

  return [
    `Create a ${type.title.toLowerCase()} for ${form.targetAudience || "entrepreneurs and business creators"}.`,
    `Goal or idea: ${source || "Create polished voice/audio for a business audience."}`,
    getAudioTypeInstruction(form.audioType),
    `Voice style: ${style.label}. Tone: ${form.tone || style.tone}.`,
    `Language: ${form.language}. Desired length: about ${form.durationSeconds} seconds.`,
    form.preferredCallToAction ? `Call to action: ${form.preferredCallToAction}.` : "",
    form.brandName ? `Brand: ${form.brandName}.` : "",
    "Make it sound natural, trustworthy, and ready to publish.",
  ]
    .filter(Boolean)
    .join("\n");
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
    form.voiceBrandProfileName ||
    form.voiceBrandProfileDescription ||
    form.voiceBrandProfileProvider ||
    form.voiceBrandProfileSource ||
    form.voiceBrandProfileAccent ||
    form.voiceBrandProfileUsageNotes;

  if (!hasData) return null;

  const style = getVoiceStyle(form.voiceStyle);
  return {
    voiceId: form.voiceId || undefined,
    name: form.voiceBrandProfileName || style.label,
    profileName: form.voiceBrandProfileName || style.label,
    description: form.voiceBrandProfileDescription || `${style.label} voice profile`,
    provider: form.voiceBrandProfileProvider || undefined,
    isClonedVoice: Boolean(form.voiceBrandProfileSource || form.voiceId),
    cloneSourceName: form.voiceBrandProfileSource || undefined,
    cloneConsentConfirmed: form.voiceBrandProfileCloneConsentConfirmed,
    accent: form.voiceBrandProfileAccent || undefined,
    brandTone: form.brandTone || form.tone || undefined,
    usageNotes: form.voiceBrandProfileUsageNotes || undefined,
    language: form.language as AudioLanguage,
    stability: 0.45,
    similarityBoost: 0.8,
    speed: 1,
  };
}

function buildBrandTemplate(form: AudioStudioFormState): BrandTemplate | null {
  const colors = splitList(form.brandColors);
  const fonts = splitList(form.brandFonts);
  const hasData = form.brandTemplateName || form.brandTemplateNotes || form.brandLogoUrl || colors.length > 0 || fonts.length > 0;
  if (!hasData) return null;
  return {
    name: form.brandTemplateName || undefined,
    description: form.brandTemplateNotes || undefined,
    logoUrl: form.brandLogoUrl || undefined,
    colors: colors.length > 0 ? colors : undefined,
    fonts: fonts.length > 0 ? fonts : undefined,
    notes: form.brandTemplateNotes || undefined,
  };
}

function formatDuration(seconds?: number) {
  if (!seconds) return "About 45 sec";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes} min`;
}

export default function AudioStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<AudioStudioFormState>(DEFAULT_STATE);
  const [history, setHistory] = useState<AudioAssetRecord[]>([]);
  const [latestAudio, setLatestAudio] = useState<AudioStudioResponse["audio"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const [mobileStep, setMobileStep] = useState<MobileStep>("type");
  const [openAdvanced, setOpenAdvanced] = useState<string | null>(null);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedType = useMemo(() => getAudioType(state.audioType), [state.audioType]);
  const selectedVoice = useMemo(() => getVoiceStyle(state.voiceStyle), [state.voiceStyle]);
  const estimatedAudioCredits = estimateAudioCreatorCredits({ durationSeconds: state.durationSeconds });
  const generatedPrompt = useMemo(() => buildPrompt(state), [state]);
  const transcriptSegments = latestAudio?.transcriptSegments || [];
  const playableAudio = Boolean(latestAudio?.downloadUrl && latestAudio.renderStrategy !== "bundle" && latestAudio.renderState === "completed");
  const queuedBundle = Boolean(latestAudio && (!playableAudio || latestAudio.renderStrategy === "bundle" || latestAudio.renderState === "queued"));
  const waveformAlt = latestAudio ? `Waveform preview for ${latestAudio.title}` : "Audio waveform preview";

  const loadHistory = async () => {
    if (!user) return;
    try {
      setLoadingHistory(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/audio-studio?limit=12", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        throw await parseApiError(response, "Could not load audio history.");
      }
      const data = (await response.json()) as AudioStudioHistoryResponse;
      setHistory(data.assets || []);
    } catch (error) {
      showErrorToast(toast, error, {
        title: "History unavailable",
        fallback: "Could not load the audio library.",
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [user]);

  const updateField = <K extends keyof AudioStudioFormState>(key: K, value: AudioStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const selectAudioType = (id: AudioTypeId) => {
    const type = getAudioType(id);
    setState((current) => ({
      ...current,
      audioType: id,
      ...type.defaults,
    }));
  };

  const mobileSectionClass = (step: MobileStep) => cn(mobileStep === step ? "block" : "hidden", "md:block");

  const selectVoiceStyle = (id: VoiceStyleId) => {
    const style = getVoiceStyle(id);
    setState((current) => ({
      ...current,
      voiceStyle: id,
      voicePreset: style.preset,
      tone: style.tone,
    }));
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

    if (!state.idea.trim() && !state.exactScript.trim()) {
      toast({
        title: "Add an idea or script",
        description: "Tell Soma what the audio should say before generating.",
      });
      return;
    }

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
          prompt: generatedPrompt,
          narrationText: state.exactScript || undefined,
          transcript: state.transcript || undefined,
          title: state.title || `${selectedType.title} - ${new Date().toLocaleDateString()}`,
          voicePreset: state.voicePreset,
          voiceId: state.voiceId || undefined,
          secondaryVoiceId: state.secondaryVoiceId || undefined,
          voiceBrandProfile: buildVoiceBrandProfile(state),
          language: state.language,
          backgroundMusic: state.backgroundMusic,
          includeIntro: state.includeIntro,
          includeOutro: state.includeOutro,
          durationSeconds: state.durationSeconds,
          brandTemplate: buildBrandTemplate(state),
          productRules: buildProductRules(state),
          brandName: state.brandName || undefined,
          tone: state.tone || selectedVoice.tone,
          scriptStyle: state.scriptStyle || selectedType.title,
          generationMode: "render",
          visibility: state.visibility,
          tags: [state.audioType, state.voiceStyle, state.language, "audio-studio"],
        }),
      });

      if (!response.ok) {
        throw await parseApiError(response, "The audio studio could not complete this request.");
      }

      const data = (await response.json()) as AudioStudioResponse;
      setLatestAudio(data.audio);
      setActiveTab("preview");
      await loadHistory();
      toast({
        title: data.audio.renderState === "completed" && data.audio.renderStrategy !== "bundle" ? "Audio ready" : "Audio render queued",
        description:
          data.audio.renderState === "completed" && data.audio.renderStrategy !== "bundle"
            ? "Your voice asset is ready to preview and use."
            : "Your script and production brief are saved while audio rendering finishes.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Generation failed",
        fallback: "The audio studio could not complete this request.",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const applyIdeaAction = (action: "ideas" | "post" | "recent" | "campaign") => {
    const suggestions: Record<typeof action, string> = {
      ideas: `Generate three strong ${selectedType.title.toLowerCase()} ideas for ${state.targetAudience || "my audience"}. Pick the best one and turn it into a polished audio concept.`,
      post: "Turn my recent social post or written idea into a natural voiceover with a strong opening and clear CTA.",
      recent: "Repurpose my recent content into a fresh audio asset that sounds useful, current, and on-brand.",
      campaign: "Create an audio asset from my current campaign goal. Make it connect to a broader 7-day content campaign.",
    };
    updateField("idea", suggestions[action]);
  };

  const applyScriptAction = (action: "write" | "hook" | "simple" | "cta" | "shorten" | "premium") => {
    const current = state.exactScript || state.idea;
    const prompt = {
      write: `Write a complete ${selectedType.title.toLowerCase()} script from this idea: ${current}`,
      hook: `Improve the opening hook for this audio and make the first 5 seconds stronger: ${current}`,
      simple: `Make this audio script simpler, clearer, and easier for beginners to understand: ${current}`,
      cta: `Add a clear, natural call to action to this audio script: ${current}`,
      shorten: `Shorten this audio script while keeping the strongest message: ${current}`,
      premium: `Make this audio script sound more premium, polished, and confident without becoming stiff: ${current}`,
    }[action];
    updateField("idea", prompt);
  };

  const applyVoiceAction = (action: "suggest" | "warmer" | "authoritative" | "teacher" | "ad") => {
    if (action === "teacher") {
      selectVoiceStyle("calm_teacher");
      return;
    }
    if (action === "ad") {
      selectVoiceStyle("energetic_promo");
      return;
    }
    if (action === "warmer") {
      selectVoiceStyle("warm_coach");
      return;
    }
    if (action === "authoritative") {
      selectVoiceStyle("professional_explainer");
      return;
    }
    const recommended: VoiceStyleId = state.audioType === "course_narration" || state.audioType === "audio_lesson" ? "calm_teacher" : state.audioType === "ad_voiceover" ? "energetic_promo" : "premium_narrator";
    selectVoiceStyle(recommended);
  };

  const TabButton = ({ id, label }: { id: OutputTab; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        activeTab === id ? "bg-[#2563EB] text-white shadow-lg shadow-blue-500/20" : "bg-white/[0.05] text-[#BFC6D4] hover:bg-white/[0.08] hover:text-white",
      )}
    >
      {label}
    </button>
  );

  const AdvancedSection = ({
    id,
    title,
    description,
    children,
  }: {
    id: string;
    title: string;
    description: string;
    children: React.ReactNode;
  }) => {
    const open = openAdvanced === id;
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B1020]/70">
        <button
          type="button"
          onClick={() => setOpenAdvanced(open ? null : id)}
          className="flex w-full items-center justify-between gap-4 p-4 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-white">{title}</span>
            <span className="mt-1 block text-xs text-[#8E98AA]">{description}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-[#8E98AA] transition", open ? "rotate-180" : "")} />
        </button>
        {open ? <div className="space-y-4 border-t border-white/[0.08] p-4">{children}</div> : null}
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8 pb-10">
          <section className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(79,157,255,0.22),transparent_34%),linear-gradient(135deg,#151A2E_0%,#101426_48%,#090B13_100%)] p-5 shadow-2xl shadow-black/30 md:p-8">
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                  <Headphones className="h-3.5 w-3.5 text-[#4F9DFF]" />
                  Voice room
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">What should Soma say today?</h1>
                  <p className="max-w-2xl text-sm leading-6 text-[#BFC6D4] md:text-base">
                    Create polished voiceovers, course narration, podcast intros, ads, and multilingual audio from one idea.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {AUDIO_TYPES.map((type) => {
                    const Icon = type.icon;
                    const selected = state.audioType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => selectAudioType(type.id)}
                        className={cn(
                          "group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/10",
                          selected ? "border-[#4F9DFF]/70 bg-[#2563EB]/15" : "border-white/[0.08] bg-[#090B13]/60 hover:border-white/[0.16]",
                        )}
                      >
                        <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F9DFF] to-[#8B5CF6] text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="block text-sm font-semibold text-white">{type.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#BFC6D4]">{type.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/[0.08] bg-[#090B13]/80 p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Studio status</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Ready to generate</h2>
                  </div>
                  <div className="rounded-2xl bg-[#151A2E] p-3 text-[#4F9DFF]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
                    <span className="text-[#BFC6D4]">Credit use</span>
                    <span className="font-semibold text-white">{estimatedAudioCredits} credits</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
                    <span className="text-[#BFC6D4]">Voice style</span>
                    <span className="font-semibold text-white">{selectedVoice.label}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
                    <span className="text-[#BFC6D4]">Language</span>
                    <span className="font-semibold text-white">{state.language}</span>
                  </div>
                  <div className="rounded-2xl border border-[#4F9DFF]/20 bg-[#4F9DFF]/10 px-4 py-3 text-xs leading-5 text-[#CFE3FF]">
                    {state.durationSeconds}s × 2 credits/sec. Reusing saved audio costs 0 credits.
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7E8799]">Soma will optimize for</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedType.intelligence.map((item) => (
                        <span key={item} className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#D8DEE9]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="sticky top-16 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#090B13]/90 p-2 backdrop-blur md:hidden">
            {[
              ["type", "Type"],
              ["script", "Script"],
              ["audience", "Audience"],
              ["voice", "Voice"],
              ["advanced", "Advanced"],
              ["output", "Output"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMobileStep(id as MobileStep)}
                className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition",
                  mobileStep === id ? "bg-[#2563EB] text-white" : "bg-white/[0.04] text-[#BFC6D4]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <form className="space-y-6" onSubmit={handleGenerate}>
              <GlassCard className={cn("space-y-5 p-5 md:p-6", mobileSectionClass("script"))}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">01 · Script / Idea</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Give Soma the message</h2>
                    <p className="mt-1 text-sm text-[#BFC6D4]">Paste an exact script, or describe the audio and Soma will write it for you.</p>
                  </div>
                  <Wand2 className="h-5 w-5 text-[#8B5CF6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">What should the audio say?</label>
                  <Textarea
                    value={state.idea}
                    onChange={(event) => updateField("idea", event.target.value)}
                    rows={4}
                    placeholder="Example: Create a 30-second voiceover explaining why digital marketing helps small businesses grow."
                    className="min-h-[130px]"
                  />
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#090B13]/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7E8799]">Soma AI ideas</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => applyIdeaAction("ideas")}>Generate audio ideas</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyIdeaAction("post")}>Turn my post into audio</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyIdeaAction("recent")}>Repurpose recent content</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyIdeaAction("campaign")}>Create from campaign goal</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Exact script, optional</label>
                  <Textarea
                    value={state.exactScript}
                    onChange={(event) => updateField("exactScript", event.target.value)}
                    rows={4}
                    placeholder="Paste exact narration if you already know what should be spoken."
                  />
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#090B13]/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7E8799]">Script actions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("write")}>Write script</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("hook")}>Improve hook</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("simple")}>Make simpler</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("cta")}>Add CTA</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("shorten")}>Shorten</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyScriptAction("premium")}>Make premium</Button>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className={cn("space-y-5 p-5 md:p-6", mobileSectionClass("audience"))}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">02 · Audience</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Who should this speak to?</h2>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Audience context helps Soma choose the right wording, pace, and examples.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Target audience</label>
                    <Textarea
                      value={state.targetAudience}
                      onChange={(event) => updateField("targetAudience", event.target.value)}
                      rows={4}
                      placeholder="Example: beginner entrepreneurs who want more customers online."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Call to action</label>
                    <Textarea
                      value={state.preferredCallToAction}
                      onChange={(event) => updateField("preferredCallToAction", event.target.value)}
                      rows={4}
                      placeholder="Example: Join the Academy, book a call, buy now, subscribe..."
                    />
                  </div>
                </div>
              </GlassCard>

              <GlassCard className={cn("space-y-5 p-5 md:p-6", mobileSectionClass("voice"))}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">03 · Voice Style</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Choose the delivery</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {VOICE_STYLES.map((style) => {
                    const selected = state.voiceStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => selectVoiceStyle(style.id)}
                        className={cn(
                          "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                          selected ? "border-[#4F9DFF]/70 bg-[#2563EB]/15" : "border-white/[0.08] bg-[#090B13]/50 hover:border-white/[0.16]",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{style.label}</span>
                          {selected ? <CheckCircle2 className="h-4 w-4 text-[#4F9DFF]" /> : null}
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-[#BFC6D4]">{style.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#090B13]/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7E8799]">Voice actions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => applyVoiceAction("suggest")}>Suggest voice style</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyVoiceAction("warmer")}>Make warmer</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyVoiceAction("authoritative")}>Make authoritative</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyVoiceAction("teacher")}>Teacher voice</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyVoiceAction("ad")}>Ad voice</Button>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Language</label>
                    <select
                      aria-label="Audio language"
                      className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#090B13] px-3 text-sm text-white"
                      value={state.language}
                      onChange={(event) => updateField("language", event.target.value)}
                    >
                      {AUDIO_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Approx. length</label>
                    <Input type="number" min={6} max={600} value={state.durationSeconds} onChange={(event) => updateField("durationSeconds", Number(event.target.value) || 45)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Brand name</label>
                    <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Optional brand name" />
                  </div>
                </div>
              </GlassCard>

              <GlassCard className={cn("space-y-4 p-5 md:p-6", mobileSectionClass("advanced"))}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">Advanced</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Production controls</h2>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Optional settings for teams that need exact voice, brand, or compliance control.</p>
                </div>

                <AdvancedSection id="voice" title="Advanced Voice" description="Voice IDs, cloning source, accent, and reusable voice profile.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Voice ID</label>
                      <Input value={state.voiceId} onChange={(event) => updateField("voiceId", event.target.value)} placeholder="Optional provider voice ID" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Secondary speaker voice ID</label>
                      <Input value={state.secondaryVoiceId} onChange={(event) => updateField("secondaryVoiceId", event.target.value)} placeholder="Optional second speaker" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Profile name</label>
                      <Input value={state.voiceBrandProfileName} onChange={(event) => updateField("voiceBrandProfileName", event.target.value)} placeholder="Brand narrator" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Provider</label>
                      <Input value={state.voiceBrandProfileProvider} onChange={(event) => updateField("voiceBrandProfileProvider", event.target.value)} placeholder="ElevenLabs, OpenAI..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Voice source / clone base</label>
                      <Input value={state.voiceBrandProfileSource} onChange={(event) => updateField("voiceBrandProfileSource", event.target.value)} placeholder="Original voice or reference" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Accent</label>
                      <Input value={state.voiceBrandProfileAccent} onChange={(event) => updateField("voiceBrandProfileAccent", event.target.value)} placeholder="Neutral, Kenyan English..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Voice description</label>
                    <Textarea value={state.voiceBrandProfileDescription} onChange={(event) => updateField("voiceBrandProfileDescription", event.target.value)} rows={3} placeholder="Describe delivery, tone, and pacing." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Usage notes</label>
                    <Textarea value={state.voiceBrandProfileUsageNotes} onChange={(event) => updateField("voiceBrandProfileUsageNotes", event.target.value)} rows={3} placeholder="Where and how this voice should be used." />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white">
                    <input
                      type="checkbox"
                      checked={state.voiceBrandProfileCloneConsentConfirmed}
                      onChange={(event) => updateField("voiceBrandProfileCloneConsentConfirmed", event.target.checked)}
                    />
                    Clone consent confirmed
                  </label>
                </AdvancedSection>

                <AdvancedSection id="production" title="Advanced Production" description="Transcript, title, background music, intro/outro, and visibility.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Title</label>
                      <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional audio title" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Script style</label>
                      <Input value={state.scriptStyle} onChange={(event) => updateField("scriptStyle", event.target.value)} placeholder="Commercial, educational..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Transcript or source text</label>
                    <Textarea value={state.transcript} onChange={(event) => updateField("transcript", event.target.value)} rows={4} placeholder="Optional supporting transcript or source text." />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-white">
                      <input type="checkbox" checked={state.backgroundMusic} onChange={(event) => updateField("backgroundMusic", event.target.checked)} />
                      Background music
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-white">
                      <input type="checkbox" checked={state.includeIntro} onChange={(event) => updateField("includeIntro", event.target.checked)} />
                      Include intro
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-white">
                      <input type="checkbox" checked={state.includeOutro} onChange={(event) => updateField("includeOutro", event.target.checked)} />
                      Include outro
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Visibility</label>
                    <select
                      aria-label="Audio visibility"
                      className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#090B13] px-3 text-sm text-white"
                      value={state.visibility}
                      onChange={(event) => updateField("visibility", event.target.value as AudioStudioFormState["visibility"])}
                    >
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </AdvancedSection>

                <AdvancedSection id="brand" title="Advanced Brand" description="Offer promise, proof points, brand assets, and compliance notes.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Product or offer name</label>
                      <Input value={state.productName} onChange={(event) => updateField("productName", event.target.value)} placeholder="Product, course, service..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Category</label>
                      <Input value={state.productCategory} onChange={(event) => updateField("productCategory", event.target.value)} placeholder="Course, app, membership..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Product promise</label>
                    <Textarea value={state.productPromise} onChange={(event) => updateField("productPromise", event.target.value)} rows={3} placeholder="What outcome should listeners expect?" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Differentiators</label>
                      <Textarea value={state.differentiators} onChange={(event) => updateField("differentiators", event.target.value)} rows={3} placeholder="Comma-separated differentiators" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Proof points</label>
                      <Textarea value={state.proofPoints} onChange={(event) => updateField("proofPoints", event.target.value)} rows={3} placeholder="Comma-separated proof points" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Prohibited claims</label>
                      <Textarea value={state.prohibitedClaims} onChange={(event) => updateField("prohibitedClaims", event.target.value)} rows={3} placeholder="Claims Soma should avoid" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Compliance notes</label>
                      <Textarea value={state.complianceNotes} onChange={(event) => updateField("complianceNotes", event.target.value)} rows={3} placeholder="Legal, regulatory, or brand guardrails." />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input value={state.brandTemplateName} onChange={(event) => updateField("brandTemplateName", event.target.value)} placeholder="Brand template name" />
                    <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="Logo URL" />
                    <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="#0f172a, #2563eb" />
                    <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Inter, Sora" />
                  </div>
                  <Textarea value={state.brandTemplateNotes} onChange={(event) => updateField("brandTemplateNotes", event.target.value)} rows={3} placeholder="Brand sound, pace, or campaign notes." />
                  <Input value={state.brandTone} onChange={(event) => updateField("brandTone", event.target.value)} placeholder="Premium, direct, helpful..." />
                </AdvancedSection>
              </GlassCard>

              <GlassCard className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                  <p className="text-sm font-semibold text-white">Estimated use: {formatCreatorCreditEstimate(estimatedAudioCredits)}.</p>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Scheduling, downloading, or reusing saved audio costs 0 credits.</p>
                </div>
                <Button type="submit" className="h-12 min-w-[210px] rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#8B5CF6]" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate voiceover
                </Button>
              </GlassCard>
            </form>

            <aside className={cn("space-y-6", mobileSectionClass("output"))}>
              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">Output</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Audio workspace</h2>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory || loading}>
                    {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <TabButton id="preview" label="Preview" />
                  <TabButton id="script" label="Script" />
                  <TabButton id="transcript" label="Transcript" />
                  <TabButton id="captions" label="Captions" />
                  <TabButton id="voice" label="Voice" />
                  <TabButton id="download" label="Download" />
                  <TabButton id="use" label="Use" />
                </div>

                {latestAudio ? (
                  <div className="mt-5 space-y-4">
                    {queuedBundle ? (
                      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                        Audio render is queued. Your script and production brief are saved.
                      </div>
                    ) : null}

                    {activeTab === "preview" ? (
                      <div className="space-y-4">
                        {latestAudio.waveformPreviewUrl ? (
                          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20">
                            <img src={latestAudio.waveformPreviewUrl} alt={waveformAlt} className="aspect-[5/1] w-full object-cover" />
                          </div>
                        ) : (
                          <div className="flex aspect-[5/1] items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.03] text-sm text-[#8E98AA]">
                            Waveform preview will appear here.
                          </div>
                        )}
                        {playableAudio && latestAudio.downloadUrl ? (
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
                          <div className="rounded-2xl border border-dashed border-white/[0.12] p-4 text-sm text-[#BFC6D4]">
                            Playback will appear when a playable audio file is available.
                          </div>
                        )}
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div className="rounded-2xl bg-white/[0.04] p-3">
                            <p className="text-[#8E98AA]">Status</p>
                            <p className="mt-1 font-semibold text-white">{latestAudio.renderState}</p>
                          </div>
                          <div className="rounded-2xl bg-white/[0.04] p-3">
                            <p className="text-[#8E98AA]">Duration</p>
                            <p className="mt-1 font-semibold text-white">{formatDuration(latestAudio.durationSeconds)}</p>
                          </div>
                          <div className="rounded-2xl bg-white/[0.04] p-3 sm:col-span-2">
                            <p className="text-[#8E98AA]">Creator Credits</p>
                            <p className="mt-1 font-semibold text-white">
                              {typeof latestAudio.credits === "number"
                                ? `Charged ${latestAudio.credits} credits${latestAudio.creditsRefunded ? ` · ${latestAudio.creditsRefunded} returned` : ""}`
                                : `${latestAudio.durationSeconds}s × 2 credits/sec estimate`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {activeTab === "script" ? (
                      <div className="space-y-3">
                        <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm leading-6 text-[#D8DEE9]">{latestAudio.narrationText}</p>
                        <Button type="button" variant="outline" onClick={() => copyText(latestAudio.narrationText, "Script")}>
                          <Copy className="h-4 w-4" />
                          Copy script
                        </Button>
                      </div>
                    ) : null}

                    {activeTab === "transcript" ? (
                      <div className="space-y-3">
                        <p className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm leading-6 text-[#D8DEE9]">
                          {latestAudio.transcript || latestAudio.narrationText}
                        </p>
                        {transcriptSegments.length ? (
                          <div className="space-y-2">
                            {transcriptSegments.slice(0, 5).map((segment) => (
                              <div key={`${segment.index}-${segment.startMs}`} className="rounded-xl bg-white/[0.04] p-3 text-xs text-[#BFC6D4]">
                                <span className="font-semibold text-white">{Math.round(segment.startMs / 1000)}s</span> · {segment.text}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {activeTab === "captions" ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-[#BFC6D4]">
                          Use the transcript as captions for video, reels, lessons, or scheduled posts.
                        </div>
                        <Button type="button" variant="outline" onClick={() => copyText(latestAudio.transcript || latestAudio.narrationText, "Captions")}>
                          <Copy className="h-4 w-4" />
                          Copy captions
                        </Button>
                      </div>
                    ) : null}

                    {activeTab === "voice" ? (
                      <div className="grid gap-3 text-sm">
                        <div className="rounded-2xl bg-white/[0.04] p-3">
                          <p className="text-[#8E98AA]">Voice</p>
                          <p className="mt-1 font-semibold text-white">{latestAudio.voicePreset}</p>
                        </div>
                        <div className="rounded-2xl bg-white/[0.04] p-3">
                          <p className="text-[#8E98AA]">Language</p>
                          <p className="mt-1 font-semibold text-white">{latestAudio.language}</p>
                        </div>
                        <div className="rounded-2xl bg-white/[0.04] p-3">
                          <p className="text-[#8E98AA]">Provider</p>
                          <p className="mt-1 font-semibold text-white">{latestAudio.provider} · {latestAudio.model}</p>
                        </div>
                      </div>
                    ) : null}

                    {activeTab === "download" ? (
                      <div className="space-y-3">
                        {latestAudio.downloadUrl ? (
                          <Button asChild className="w-full rounded-2xl">
                            <a href={latestAudio.downloadUrl} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                              Download asset
                            </a>
                          </Button>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/[0.12] p-4 text-sm text-[#BFC6D4]">Download will appear when the asset is ready.</div>
                        )}
                        <p className="text-xs text-[#8E98AA]">Saved status: {latestAudio.status}. Prompt version: {latestAudio.promptVersion}.</p>
                      </div>
                    ) : null}

                    {activeTab === "use" ? (
                      <div className="grid gap-3">
                        <Button type="button" variant="outline" onClick={() => copyText(latestAudio.narrationText, "Script")}>
                          <Copy className="h-4 w-4" />
                          Copy transcript
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setActiveTab("captions")}>
                          <FileText className="h-4 w-4" />
                          Create captions
                        </Button>
                        <Button type="button" variant="outline" onClick={() => updateField("audioType", "multilingual_message")}>
                          <Languages className="h-4 w-4" />
                          Translate
                        </Button>
                        <Button type="button" variant="outline" onClick={() => (window.location.href = "/ai/video-studio")}>
                          <Video className="h-4 w-4" />
                          Attach to video
                        </Button>
                        <Button type="button" variant="outline" onClick={() => (window.location.href = "/social/calendar")}>
                          <Send className="h-4 w-4" />
                          Schedule with post
                        </Button>
                        <Button type="button" variant="outline" onClick={() => (window.location.href = "/social/calendar?intent=campaign")}>
                          <Sparkles className="h-4 w-4" />
                          Create 7-day audio campaign
                        </Button>
                        <Button type="button" variant="outline" onClick={() => loadHistory()}>
                          <Library className="h-4 w-4" />
                          Save to library
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/[0.12] p-6 text-sm leading-6 text-[#BFC6D4]">
                    Generate audio to preview playback, script, transcript, captions, download options, and next actions.
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4F9DFF]">Library</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Recent audio</h2>
                  </div>
                  <Music2 className="h-5 w-5 text-[#8B5CF6]" />
                </div>
                <div className="mt-4 space-y-3">
                  {history.length ? (
                    history.slice(0, 5).map((asset) => (
                      <button
                        key={asset.assetId}
                        type="button"
                        onClick={() => {
                          setLatestAudio(asset as unknown as AudioStudioResponse["audio"]);
                          setActiveTab("preview");
                        }}
                        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-[#4F9DFF]/50 hover:bg-white/[0.06]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="line-clamp-1 text-sm font-semibold text-white">{asset.title}</span>
                          <ArrowRight className="h-4 w-4 text-[#8E98AA]" />
                        </div>
                        <p className="mt-1 text-xs text-[#8E98AA]">
                          {asset.voicePreset} · {asset.language} · {asset.status}
                        </p>
                        {asset.downloadUrl && asset.renderStrategy !== "bundle" ? (
                          <div className="mt-3 flex items-center gap-2 text-xs text-[#BFC6D4]">
                            <Play className="h-3.5 w-3.5" />
                            Playable audio saved
                          </div>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/[0.12] p-4 text-sm text-[#BFC6D4]">
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

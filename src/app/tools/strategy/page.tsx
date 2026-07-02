"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  Bot,
  Check,
  Clipboard,
  Download,
  FileText,
  Gauge,
  Lightbulb,
  RefreshCcw,
  Route,
  Sparkles,
  Target,
} from "lucide-react";

type StrategyForm = {
  businessName: string;
  stage: string;
  audience: string;
  problem: string;
  offer: string;
  revenueModel: string;
  primaryChannel: string;
  goal: string;
  timeHorizon: string;
  budget: string;
  advantage: string;
  keyMetric: string;
};

type CanvasKey =
  | "valueProposition"
  | "customerSegments"
  | "channels"
  | "relationships"
  | "revenueStreams"
  | "keyActivities"
  | "keyResources"
  | "partners"
  | "costs";

type SwotKey = "strengths" | "weaknesses" | "opportunities" | "threats";
type GtmKey = "leadMagnet" | "firstOffer" | "launchPlan" | "retentionLoop";

const defaultForm: StrategyForm = {
  businessName: "",
  stage: "idea",
  audience: "",
  problem: "",
  offer: "",
  revenueModel: "one-time",
  primaryChannel: "community",
  goal: "",
  timeHorizon: "90 days",
  budget: "lean",
  advantage: "",
  keyMetric: "",
};

const defaultCanvas: Record<CanvasKey, string> = {
  valueProposition: "",
  customerSegments: "",
  channels: "",
  relationships: "",
  revenueStreams: "",
  keyActivities: "",
  keyResources: "",
  partners: "",
  costs: "",
};

const defaultSwot: Record<SwotKey, string> = {
  strengths: "",
  weaknesses: "",
  opportunities: "",
  threats: "",
};

const defaultGtm: Record<GtmKey, string> = {
  leadMagnet: "",
  firstOffer: "",
  launchPlan: "",
  retentionLoop: "",
};

const canvasFields: Array<{ key: CanvasKey; label: string; hint: string }> = [
  { key: "valueProposition", label: "Value Proposition", hint: "The clear result your customer buys." },
  { key: "customerSegments", label: "Customer Segments", hint: "The specific people or teams you serve." },
  { key: "channels", label: "Channels", hint: "Where attention, trust, and sales will come from." },
  { key: "relationships", label: "Relationships", hint: "How you nurture leads and customers." },
  { key: "revenueStreams", label: "Revenue Streams", hint: "How money enters the business." },
  { key: "keyActivities", label: "Key Activities", hint: "The weekly work that makes the model run." },
  { key: "keyResources", label: "Key Resources", hint: "Assets, skills, data, or systems required." },
  { key: "partners", label: "Partners", hint: "People, platforms, or suppliers you rely on." },
  { key: "costs", label: "Cost Structure", hint: "The main costs and constraints to watch." },
];

const swotFields: Array<{ key: SwotKey; label: string; tone: string }> = [
  { key: "strengths", label: "Strengths", tone: "border-emerald-400/30 text-emerald-300" },
  { key: "weaknesses", label: "Weaknesses", tone: "border-amber-400/30 text-amber-300" },
  { key: "opportunities", label: "Opportunities", tone: "border-cyan-400/30 text-cyan-300" },
  { key: "threats", label: "Threats", tone: "border-rose-400/30 text-rose-300" },
];

const gtmFields: Array<{ key: GtmKey; label: string; hint: string }> = [
  { key: "leadMagnet", label: "Lead Magnet", hint: "A low-friction reason for the audience to raise their hand." },
  { key: "firstOffer", label: "First Offer", hint: "The smallest paid transformation you can deliver reliably." },
  { key: "launchPlan", label: "Launch Plan", hint: "The sequence of messages, proof, and calls to action." },
  { key: "retentionLoop", label: "Retention Loop", hint: "How customers return, renew, refer, or ascend." },
];

export default function StrategyToolPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<StrategyForm>(defaultForm);
  const [canvas, setCanvas] = useState<Record<CanvasKey, string>>(defaultCanvas);
  const [swot, setSwot] = useState<Record<SwotKey, string>>(defaultSwot);
  const [gtm, setGtm] = useState<Record<GtmKey, string>>(defaultGtm);
  const [completedActions, setCompletedActions] = useState<string[]>([]);

  const strategyName = form.businessName.trim() || "Untitled Strategy";
  const requiredValues = [
    form.businessName,
    form.audience,
    form.problem,
    form.offer,
    form.goal,
    form.advantage,
    form.keyMetric,
  ];
  const completion = Math.round(
    (requiredValues.filter((value) => value.trim().length > 0).length / requiredValues.length) * 100
  );

  const recommendations = useMemo(() => {
    const channel =
      form.primaryChannel === "community"
        ? "publish proof-led posts and invite warm conversations"
        : form.primaryChannel === "content"
          ? "turn the problem into a weekly content series"
          : form.primaryChannel === "partnerships"
            ? "build a short list of aligned partners and package a referral offer"
            : "run a tight paid test with one audience, one promise, and one conversion event";

    const budget =
      form.budget === "lean"
        ? "avoid heavy tooling until the first conversion signal is clear"
        : form.budget === "growth"
          ? "spend only on channels with measurable lead quality"
          : "split investment between acquisition, fulfillment capacity, and retention";

    return [
      `Use ${channel}.`,
      `For the next ${form.timeHorizon}, make "${form.keyMetric || "one measurable traction metric"}" the scoreboard.`,
      `Because the budget is ${form.budget}, ${budget}.`,
    ];
  }, [form.budget, form.keyMetric, form.primaryChannel, form.timeHorizon]);

  const actionPlan = useMemo(() => {
    const audience = form.audience || "your target customer";
    const offer = form.offer || "your core offer";
    const metric = form.keyMetric || "one traction metric";

    return [
      { id: "define", label: `Tighten the promise for ${audience}.` },
      { id: "validate", label: `Interview 5 prospects about the painful moment behind ${offer}.` },
      { id: "publish", label: `Create 3 proof assets for the primary channel.` },
      { id: "measure", label: `Review ${metric} every Friday and adjust the next sprint.` },
    ];
  }, [form.audience, form.keyMetric, form.offer]);

  const strategyBrief = useMemo(() => {
    const lines = [
      `# ${strategyName}`,
      "",
      `Stage: ${form.stage}`,
      `Time Horizon: ${form.timeHorizon}`,
      `Primary Goal: ${form.goal || "Not defined yet"}`,
      `Key Metric: ${form.keyMetric || "Not defined yet"}`,
      "",
      "## Positioning",
      `Audience: ${form.audience || "Not defined yet"}`,
      `Problem: ${form.problem || "Not defined yet"}`,
      `Offer: ${form.offer || "Not defined yet"}`,
      `Advantage: ${form.advantage || "Not defined yet"}`,
      "",
      "## Business Model",
      `Revenue Model: ${form.revenueModel}`,
      `Primary Channel: ${form.primaryChannel}`,
      `Budget Mode: ${form.budget}`,
      "",
      "## Recommendations",
      ...recommendations.map((item) => `- ${item}`),
      "",
      "## Next Actions",
      ...actionPlan.map((item) => `- ${item.label}`),
    ];

    return lines.join("\n");
  }, [actionPlan, form, recommendations, strategyName]);

  const updateForm = (key: keyof StrategyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(strategyBrief);
      toast({ title: "Strategy copied", description: "The current brief is on your clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  const downloadBrief = () => {
    const blob = new Blob([strategyBrief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${strategyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "strategy"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Strategy exported", description: "Markdown brief downloaded." });
  };

  const resetBuilder = () => {
    setForm(defaultForm);
    setCanvas(defaultCanvas);
    setSwot(defaultSwot);
    setGtm(defaultGtm);
    setCompletedActions([]);
    toast({ title: "Builder reset", description: "You have a clean strategy workspace." });
  };

  const toggleAction = (id: string) => {
    setCompletedActions((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Builder alpha
                </Badge>
                <Badge variant="outline" className="border-white/15 text-white/70">
                  {completion}% complete
                </Badge>
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Strategy Builder</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Shape a business idea into a focused operating plan: positioning, model, SWOT, go-to-market, and the next actions that matter.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={resetBuilder}>
                <RefreshCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button variant="outline" onClick={copyBrief}>
                <Clipboard className="h-4 w-4" />
                Copy
              </Button>
              <Button onClick={downloadBrief}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </section>

          <GlassCard className="rounded-lg border-cyan-400/20 bg-cyan-400/[0.06] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-cyan-100">AI strategy coach is on the way</h2>
                  <p className="mt-1 text-sm leading-5 text-white/70">
                    This builder is live now for structured planning. Soon it will generate recommendations, pressure-test assumptions, and turn your inputs into sharper execution plans.
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="w-fit shrink-0 border-cyan-400/30 text-cyan-200">
                Advancing weekly
              </Badge>
            </div>
          </GlassCard>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <GlassCard className="rounded-lg p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                    <Target className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">Strategy Inputs</h2>
                    <p className="text-sm text-muted-foreground">Start with the decisions that shape the whole plan.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Business name">
                    <Input value={form.businessName} onChange={(event) => updateForm("businessName", event.target.value)} placeholder="Soma Digital" />
                  </Field>
                  <Field label="Stage">
                    <Select value={form.stage} onValueChange={(value) => updateForm("stage", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="idea">Idea</SelectItem>
                        <SelectItem value="validation">Validation</SelectItem>
                        <SelectItem value="launch">Launch</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="scale">Scale</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Target audience">
                    <Input value={form.audience} onChange={(event) => updateForm("audience", event.target.value)} placeholder="Solo founders selling digital products" />
                  </Field>
                  <Field label="Primary goal">
                    <Input value={form.goal} onChange={(event) => updateForm("goal", event.target.value)} placeholder="Validate a paid offer in 30 days" />
                  </Field>
                  <Field label="Problem">
                    <Textarea value={form.problem} onChange={(event) => updateForm("problem", event.target.value)} placeholder="What painful, expensive, or urgent problem are they trying to solve?" />
                  </Field>
                  <Field label="Offer">
                    <Textarea value={form.offer} onChange={(event) => updateForm("offer", event.target.value)} placeholder="What transformation do you sell, and in what format?" />
                  </Field>
                  <Field label="Revenue model">
                    <Select value={form.revenueModel} onValueChange={(value) => updateForm("revenueModel", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one-time">One-time purchase</SelectItem>
                        <SelectItem value="subscription">Subscription</SelectItem>
                        <SelectItem value="service">Service package</SelectItem>
                        <SelectItem value="marketplace">Marketplace</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Primary channel">
                    <Select value={form.primaryChannel} onValueChange={(value) => updateForm("primaryChannel", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="community">Community</SelectItem>
                        <SelectItem value="content">Content</SelectItem>
                        <SelectItem value="partnerships">Partnerships</SelectItem>
                        <SelectItem value="paid">Paid acquisition</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Time horizon">
                    <Select value={form.timeHorizon} onValueChange={(value) => updateForm("timeHorizon", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30 days">30 days</SelectItem>
                        <SelectItem value="90 days">90 days</SelectItem>
                        <SelectItem value="6 months">6 months</SelectItem>
                        <SelectItem value="12 months">12 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Budget mode">
                    <Select value={form.budget} onValueChange={(value) => updateForm("budget", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lean">Lean</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="funded">Funded</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Unfair advantage">
                    <Input value={form.advantage} onChange={(event) => updateForm("advantage", event.target.value)} placeholder="Audience, expertise, data, network, speed..." />
                  </Field>
                  <Field label="Key metric">
                    <Input value={form.keyMetric} onChange={(event) => updateForm("keyMetric", event.target.value)} placeholder="Qualified calls booked, MRR, activation rate..." />
                  </Field>
                </div>
              </GlassCard>

              <Tabs defaultValue="canvas" className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-3 bg-muted/60 p-1">
                  <TabsTrigger value="canvas" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Canvas
                  </TabsTrigger>
                  <TabsTrigger value="swot" className="gap-2">
                    <Gauge className="h-4 w-4" />
                    SWOT
                  </TabsTrigger>
                  <TabsTrigger value="gtm" className="gap-2">
                    <Route className="h-4 w-4" />
                    GTM
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="canvas" className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    {canvasFields.map((field) => (
                      <GlassCard key={field.key} className="rounded-lg p-4">
                        <Field label={field.label} hint={field.hint}>
                          <Textarea
                            className="min-h-28"
                            value={canvas[field.key]}
                            onChange={(event) => setCanvas((current) => ({ ...current, [field.key]: event.target.value }))}
                            placeholder="Add notes..."
                          />
                        </Field>
                      </GlassCard>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="swot" className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {swotFields.map((field) => (
                      <GlassCard key={field.key} className="rounded-lg p-4">
                        <Badge variant="outline" className={field.tone}>{field.label}</Badge>
                        <Textarea
                          className="mt-3 min-h-36"
                          value={swot[field.key]}
                          onChange={(event) => setSwot((current) => ({ ...current, [field.key]: event.target.value }))}
                          placeholder={`List ${field.label.toLowerCase()}...`}
                        />
                      </GlassCard>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="gtm" className="mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {gtmFields.map((field, index) => (
                      <GlassCard key={field.key} className="rounded-lg p-4">
                        <div className="mb-3 flex items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-sm font-semibold text-primary">
                            {index + 1}
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">{field.label}</h3>
                            <p className="text-xs leading-5 text-muted-foreground">{field.hint}</p>
                          </div>
                        </div>
                        <Textarea
                          className="min-h-32"
                          value={gtm[field.key]}
                          onChange={(event) => setGtm((current) => ({ ...current, [field.key]: event.target.value }))}
                          placeholder="Define this part of the launch system..."
                        />
                      </GlassCard>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
              <GlassCard className="rounded-lg p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{strategyName}</h2>
                    <p className="text-sm text-muted-foreground">Live strategy brief</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-lg font-bold text-primary">
                    {completion}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completion}%` }} />
                </div>

                <div className="mt-5 space-y-3">
                  {recommendations.map((item) => (
                    <div key={item} className="flex gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <p className="text-sm leading-5 text-white/80">{item}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard className="rounded-lg p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-300" />
                  <h2 className="text-lg font-semibold">Next Actions</h2>
                </div>
                <div className="space-y-2">
                  {actionPlan.map((action) => {
                    const isDone = completedActions.includes(action.id);
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => toggleAction(action.id)}
                        className="flex w-full items-start gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
                      >
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isDone ? "border-emerald-400 bg-emerald-400 text-background" : "border-white/20"}`}>
                          {isDone && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className={`text-sm leading-5 ${isDone ? "text-white/45 line-through" : "text-white/80"}`}>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </GlassCard>

              <GlassCard className="rounded-lg p-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-cyan-300" />
                  <h2 className="text-lg font-semibold">Brief Preview</h2>
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/70">
                  {strategyBrief}
                </pre>
                <Button className="mt-4 w-full" onClick={copyBrief}>
                  Copy Brief
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </GlassCard>
            </aside>
          </section>
        </main>
      </AppLayout>
    </ProtectedRoute>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm text-white/85">{label}</Label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

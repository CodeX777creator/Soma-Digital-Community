"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";

import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

type AudienceTier = "all" | "explorer" | "pro" | "elite" | "enterprise";
type Campaign = {
  campaignId: string;
  subject: string;
  preheader?: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  audienceTier: AudienceTier;
  status: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  createdAt?: unknown;
};

type CampaignForm = Omit<Campaign, "campaignId" | "status" | "recipientCount" | "sentCount" | "failedCount" | "createdAt">;

const EMPTY_FORM: CampaignForm = { subject: "", preheader: "", body: "", ctaLabel: "", ctaUrl: "", audienceTier: "all" };

function dateLabel(value: unknown) {
  if (!value) return "-";
  const date = typeof value === "object" && value && "seconds" in value ? new Date(Number((value as { seconds: number }).seconds) * 1000) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Email campaign action failed.");
  return payload;
}

export default function AdminEmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCampaigns() {
    setLoading(true);
    try {
      const payload = await adminFetch("/api/admin/email-campaigns");
      setCampaigns(payload.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load campaigns.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCampaigns(); }, []);

  function updateForm<K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveCampaign(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = await adminFetch(editingId ? `/api/admin/email-campaigns/${editingId}` : "/api/admin/email-campaigns", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) });
      if (!editingId) setCampaigns((current) => [payload.campaign, ...current]);
      else await loadCampaigns();
      setForm(EMPTY_FORM);
      setEditingId(null);
      setNotice("Campaign draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function sendCampaign(campaign: Campaign) {
    if (!window.confirm(`Send “${campaign.subject}” to opted-in ${campaign.audienceTier === "all" ? "members" : `${campaign.audienceTier} members`}?`)) return;
    setSendingId(campaign.campaignId);
    setError(null);
    setNotice(null);
    try {
      const result = await adminFetch(`/api/admin/email-campaigns/${campaign.campaignId}/send`, { method: "POST" });
      setNotice(result.continueSending ? "Batch sent. Send again to continue the remaining recipients." : "Campaign sent to eligible recipients.");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send campaign.");
    } finally {
      setSendingId(null);
    }
  }

  function editCampaign(campaign: Campaign) {
    setEditingId(campaign.campaignId);
    setForm({ subject: campaign.subject, preheader: campaign.preheader || "", body: campaign.body, ctaLabel: campaign.ctaLabel || "", ctaUrl: campaign.ctaUrl || "", audienceTier: campaign.audienceTier });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Email campaigns</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Newsletters and member updates</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Send branded email only to members who explicitly opted in. Delivery, bounce, complaint, open, and click events are tracked through Resend webhooks.</p>
        </div>
        <Button variant="outline" onClick={() => void loadCampaigns()}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {notice ? <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" />{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <GlassCard className="p-6">
          <div className="flex items-center gap-3"><Mail className="h-5 w-5 text-cyan-300" /><div><h2 className="font-semibold text-white">{editingId ? "Edit campaign draft" : "Create campaign draft"}</h2><p className="text-xs text-white/45">Plain-text composition is converted into a safe branded email.</p></div></div>
          <form onSubmit={saveCampaign} className="mt-6 space-y-4">
            <label className="block text-sm text-white/75">Subject<input required value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} maxLength={180} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-cyan-300/50" placeholder="A useful update for the SDC community" /></label>
            <label className="block text-sm text-white/75">Preheader<input value={form.preheader} onChange={(event) => updateForm("preheader", event.target.value)} maxLength={240} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-cyan-300/50" placeholder="The short preview shown beside the subject" /></label>
            <label className="block text-sm text-white/75">Audience<select value={form.audienceTier} onChange={(event) => updateForm("audienceTier", event.target.value as AudienceTier)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-cyan-300/50"><option value="all">All opted-in members</option><option value="explorer">Explorer</option><option value="pro">Pro</option><option value="elite">Elite</option><option value="enterprise">Enterprise</option></select></label>
            <label className="block text-sm text-white/75">Message<textarea required value={form.body} onChange={(event) => updateForm("body", event.target.value)} maxLength={100000} rows={12} className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-3 leading-6 text-white outline-none focus:border-cyan-300/50" placeholder="Write the newsletter or campaign message..." /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-white/75">Button label<input value={form.ctaLabel || ""} onChange={(event) => updateForm("ctaLabel", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-cyan-300/50" placeholder="Read the update" /></label><label className="block text-sm text-white/75">Button URL<input value={form.ctaUrl || ""} onChange={(event) => updateForm("ctaUrl", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-cyan-300/50" placeholder="https://www.somatoday.com/..." /></label></div>
            <div className="flex flex-wrap gap-3 pt-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update draft" : "Save draft"}</Button>{editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</Button> : null}</div>
          </form>
        </GlassCard>

        <GlassCard className="h-fit p-6">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" /><div><h2 className="font-semibold text-white">Delivery safeguards</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-white/55"><li>Only explicit marketing opt-ins are eligible.</li><li>Unsubscribed, bounced, and complained addresses are suppressed.</li><li>Each recipient gets a signed unsubscribe link.</li><li>Resend delivery events update campaign records.</li><li>Sending uses idempotency keys to prevent duplicates.</li></ul></div></div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4"><div><h2 className="font-semibold text-white">Campaign history</h2><p className="text-xs text-white/45">Draft, delivery, and suppression-aware sending status.</p></div><span className="text-xs text-white/45">{campaigns.length} campaigns</span></div>
        {loading ? <p className="px-6 py-12 text-center text-sm text-white/45">Loading campaigns...</p> : !campaigns.length ? <p className="px-6 py-12 text-center text-sm text-white/45">No campaigns yet. Create your first draft above.</p> : <div className="divide-y divide-white/10">{campaigns.map((campaign) => <div key={campaign.campaignId} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-white">{campaign.subject}</h3><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-white/55">{campaign.status}</span><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-200">{campaign.audienceTier}</span></div><p className="mt-2 line-clamp-2 text-sm text-white/55">{campaign.body}</p><p className="mt-2 text-xs text-white/35">Created {dateLabel(campaign.createdAt)} · {campaign.sentCount || 0} sent · {campaign.failedCount || 0} failed</p></div><div className="flex shrink-0 flex-wrap gap-2">{["draft", "failed", "sending"].includes(campaign.status) ? <><Button size="sm" variant="outline" onClick={() => editCampaign(campaign)}>Edit</Button><Button size="sm" onClick={() => void sendCampaign(campaign)} disabled={sendingId === campaign.campaignId}>{sendingId === campaign.campaignId ? "Sending..." : campaign.status === "sending" ? "Continue sending" : <><Send className="h-4 w-4" />Send campaign</>}</Button></> : null}</div></div>)}</div>}
      </GlassCard>
    </div>
  );
}

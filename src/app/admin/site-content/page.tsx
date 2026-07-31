"use client";

import { useEffect, useMemo, useState } from "react";
import { FileEdit, Eye, Loader2, Plus, Save, Send, Archive, Clock3 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/AdminState";
import { RichText } from "@/lib/content/rich-text";

type ContentType = "blog" | "case_study" | "about" | "terms" | "privacy";
type ContentStatus = "draft" | "published" | "archived";
type ContentSection = { heading: string; body: string };
type RecordItem = { contentId: string; type: ContentType; status: ContentStatus; title: string; slug: string; description: string; summary: string; category: string; author: string; body: string; sections: ContentSection[]; takeaways: string[]; imageUrl: string; seoTitle: string; seoDescription: string; revisionCount: number; updatedAt?: string | null };
type FormState = Omit<RecordItem, "contentId" | "revisionCount" | "updatedAt" | "takeaways" | "sections"> & { contentId?: string; takeawaysText: string; sections: ContentSection[] };

const emptyForm: FormState = { type: "blog", status: "draft", title: "", slug: "", description: "", summary: "", category: "", author: "Soma Digital Community", body: "", takeawaysText: "", sections: [{ heading: "", body: "" }], imageUrl: "", seoTitle: "", seoDescription: "" };

async function contentFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Content action failed.");
  return payload;
}

export default function AdminSiteContentPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const payload = await contentFetch("/api/admin/site-content");
      setRecords(payload.content || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load website content.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openRecord = (record: RecordItem) => setForm({ ...record, sections: record.sections?.length ? record.sections : [{ heading: "Overview", body: record.body }], takeawaysText: record.takeaways.join("\n") });
  const newRecord = (type: ContentType = "blog") => setForm({ ...emptyForm, type, category: type === "case_study" ? "Workflow example" : type === "blog" ? "Insights" : "" });
  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updateSection = (index: number, key: keyof ContentSection, value: string) => setForm((current) => ({ ...current, sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, [key]: value } : section) }));
  const addSection = () => setForm((current) => ({ ...current, sections: [...current.sections, { heading: "", body: "" }] }));
  const removeSection = (index: number) => setForm((current) => ({ ...current, sections: current.sections.length > 1 ? current.sections.filter((_, sectionIndex) => sectionIndex !== index) : current.sections }));

  const payload = useMemo(() => ({ ...form, body: form.sections.map((section) => section.body.trim()).filter(Boolean).join("\n\n"), takeaways: form.takeawaysText.split("\n").map((item) => item.trim()).filter(Boolean), sections: form.sections.map((section) => ({ heading: section.heading.trim(), body: section.body.trim() })).filter((section) => section.heading || section.body), relatedLinks: [] }), [form]);

  const save = async (status: ContentStatus = form.status) => {
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const body = { ...payload, status };
      const response = await contentFetch(form.contentId ? `/api/admin/site-content/${form.contentId}` : "/api/admin/site-content", { method: form.contentId ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (response.contentId && !form.contentId) setForm((current) => ({ ...current, contentId: response.contentId }));
      await load();
      setNotice(status === "published" ? "Published successfully." : "Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save content.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!form.contentId || !window.confirm("Archive this content? It will disappear from public pages.")) return;
    try {
      setSaving(true);
      await contentFetch(`/api/admin/site-content/${form.contentId}`, { method: "DELETE" });
      newRecord(form.type);
      await load();
      setNotice("Content archived.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive content.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Website content</p><h2 className="mt-2 text-3xl font-semibold">Write, preview, and publish</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Manage public articles, workflow case studies, About, Terms, and Privacy from one controlled publishing surface. Drafts never appear in public routes.</p></header>
      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <button type="button" onClick={() => newRecord()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300"><Plus className="h-4 w-4" />New content</button>
          <div className="flex flex-wrap gap-2">{(["blog", "case_study", "about", "terms", "privacy"] as ContentType[]).map((type) => <button key={type} type="button" onClick={() => newRecord(type)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-cyan-300/40 hover:text-white">New {type.replace("_", " ")}</button>)}</div>
          {loading ? <AdminLoadingState label="Loading website content..." /> : null}
          {!loading && !records.length ? <AdminEmptyState title="No CMS records yet" description="Create a draft to take ownership of a public page." /> : null}
          <div className="space-y-2">{records.map((record) => <button key={record.contentId} type="button" onClick={() => openRecord(record)} className={`w-full rounded-xl border p-3 text-left transition ${form.contentId === record.contentId ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}><div className="flex items-start justify-between gap-3"><span className="line-clamp-2 text-sm font-semibold text-white">{record.title || "Untitled"}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${record.status === "published" ? "bg-emerald-400/10 text-emerald-300" : record.status === "archived" ? "bg-white/10 text-white/40" : "bg-amber-400/10 text-amber-300"}`}>{record.status}</span></div><p className="mt-2 text-xs text-white/40">{record.type.replace("_", " ")} · {record.slug}</p></button>)}</div>
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          {error ? <AdminErrorState description={error} onRetry={() => setError("")} retryLabel="Dismiss" /> : null}
          {notice ? <p className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-white/35">{form.contentId ? `Revision ${records.find((item) => item.contentId === form.contentId)?.revisionCount || 1}` : "New draft"}</p><h3 className="mt-1 text-xl font-semibold">{form.title || "Untitled content"}</h3></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreview((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-white/70 hover:bg-white/10"><Eye className="h-4 w-4" />{preview ? "Edit" : "Preview"}</button>{form.contentId ? <button type="button" onClick={archive} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-400/20 px-3 text-sm text-red-200 hover:bg-red-400/10"><Archive className="h-4 w-4" />Archive</button> : null}</div></div>
          {preview ? <Preview form={form} /> : <>
            <div className="grid gap-4 md:grid-cols-2"><Field label="Content type"><select value={form.type} disabled={Boolean(form.contentId)} onChange={(event) => update("type", event.target.value)} className="cms-input">{(["blog", "case_study", "about", "terms", "privacy"] as ContentType[]).map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}</select></Field><Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value)} className="cms-input">{(["draft", "published", "archived"] as ContentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><Field label="Title"><input value={form.title} onChange={(event) => update("title", event.target.value)} className="cms-input" placeholder="A clear public title" /></Field><Field label="Slug"><input value={form.slug} onChange={(event) => update("slug", event.target.value)} className="cms-input" placeholder="clear-url-slug" /></Field><Field label="Category"><input value={form.category} onChange={(event) => update("category", event.target.value)} className="cms-input" placeholder="Insights, workflow example..." /></Field><Field label="Author"><input value={form.author} onChange={(event) => update("author", event.target.value)} className="cms-input" /></Field></div>
            <div className="mt-4 grid gap-4"><Field label="SEO description"><textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={3} className="cms-input resize-y" placeholder="One concise description for search and sharing." /></Field><Field label="Answer summary"><textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} rows={3} className="cms-input resize-y" placeholder="Answer the page topic directly in plain language." /></Field>
            {form.type === "blog" || form.type === "case_study" ? <div className="space-y-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.03] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Article structure</p><p className="mt-1 text-sm leading-6 text-white/50">Build the article in sections. Use blank lines for paragraphs and start list items with <code className="text-cyan-200">-</code> or <code className="text-cyan-200">1.</code>.</p></div><button type="button" onClick={addSection} className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300/25 px-3 text-sm text-cyan-100 hover:bg-cyan-300/10"><Plus className="h-4 w-4" />Add section</button></div>{form.sections.map((section, index) => <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">Section {index + 1}</p>{form.sections.length > 1 ? <button type="button" onClick={() => removeSection(index)} className="text-xs text-red-200/75 hover:text-red-100">Remove</button> : null}</div><div className="grid gap-3"><input value={section.heading} onChange={(event) => updateSection(index, "heading", event.target.value)} className="cms-input" placeholder="Section heading, e.g. Why this matters" /><textarea value={section.body} onChange={(event) => updateSection(index, "body", event.target.value)} rows={7} className="cms-input resize-y" placeholder="Write the section. Separate paragraphs with a blank line. Use - for bullets or 1. for numbered points." /></div></div>)}</div> : <Field label="Page body"><textarea value={form.body} onChange={(event) => update("body", event.target.value)} rows={14} className="cms-input resize-y" placeholder="Write the page content here. Use blank lines to separate paragraphs." /></Field>}
            <Field label="Key takeaways (one per line)"><textarea value={form.takeawaysText} onChange={(event) => update("takeawaysText", event.target.value)} rows={5} className="cms-input resize-y" placeholder="One useful takeaway per line" /></Field></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="SEO title"><input value={form.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} className="cms-input" placeholder="Optional title override" /></Field><Field label="SEO description override"><input value={form.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} className="cms-input" placeholder="Optional description override" /></Field></div>
            <div className="mt-4"><AdminMediaPicker label="Social/share image" value={form.imageUrl} kind="image" usageContext="general" helperText="Upload from device, choose from the media library, or add an external image URL." onChange={(url) => update("imageUrl", url)} /></div>
          </>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><p className="flex items-center gap-2 text-xs text-white/40"><Clock3 className="h-4 w-4" />Every save creates a revision and audit entry.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void save("draft")} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm text-white/75 hover:bg-white/10 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving..." : "Save draft"}</button><button type="button" onClick={() => void save("published")} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"><Send className="h-4 w-4" />Publish</button></div></div>
        </section>
      </div>
      <style jsx global>{`.cms-input{min-height:2.75rem;width:100%;border-radius:.8rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.24);padding:.7rem .85rem;color:white;outline:none}.cms-input:focus{border-color:rgba(34,211,238,.55)}.cms-input::placeholder{color:rgba(255,255,255,.34)}.cms-input option{background:#0b0e14;color:white}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{label}</span>{children}</label>; }
function Preview({ form }: { form: FormState }) { return <article className="rounded-2xl border border-white/10 bg-black/20 p-6"><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{form.category || "Public content"}</p><h1 className="mt-4 text-4xl font-semibold text-white">{form.title || "Untitled content"}</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-white/65">{form.summary || form.description || "Add an answer summary to preview the public introduction."}</p><div className="mt-8 space-y-8">{(form.sections.length ? form.sections : [{ heading: "Overview", body: form.body }]).filter((section) => section.heading || section.body).map((section, index) => <section key={`${section.heading}-${index}`} className="space-y-4"><h2 className="border-b border-white/10 pb-3 text-2xl font-semibold text-white">{section.heading || "Overview"}</h2><RichText value={section.body} /></section>)}</div></article>; }

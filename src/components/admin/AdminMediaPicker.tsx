"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, ImageIcon, LinkIcon, Loader2, Music, Upload, Video, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import type { AdminMediaAsset, AdminMediaKind, AdminMediaUsageContext } from "@/admin/media";

type PickerMode = "upload" | "library" | "url";

interface AdminMediaPickerProps {
  label: string;
  value?: string;
  accept?: string;
  kind?: AdminMediaKind | "all";
  usageContext?: AdminMediaUsageContext;
  linkedEntityType?: string;
  linkedEntityId?: string;
  helperText?: string;
  aspectHint?: string;
  allowUrl?: boolean;
  allowLibrary?: boolean;
  onChange: (url: string, asset?: AdminMediaAsset | null) => void;
}

async function adminMediaFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Media action failed.");
  return payload;
}

export function AdminMediaPicker({
  label,
  value = "",
  accept,
  kind = "all",
  usageContext = "general",
  linkedEntityType,
  linkedEntityId,
  helperText,
  aspectHint,
  allowUrl = true,
  allowLibrary = true,
  onChange,
}: AdminMediaPickerProps) {
  const [mode, setMode] = useState<PickerMode>("upload");
  const [assets, setAssets] = useState<AdminMediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedKind = useMemo(() => inferKind(value, kind), [kind, value]);

  useEffect(() => setUrlDraft(value), [value]);

  const loadAssets = async () => {
    if (!allowLibrary) return;
    try {
      setLoadingAssets(true);
      setError("");
      const params = new URLSearchParams({ usageContext, limit: "30" });
      if (kind !== "all") params.set("kind", kind);
      const payload = await adminMediaFetch(`/api/admin/media?${params.toString()}`);
      setAssets(payload.assets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load media library.");
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (mode === "library") void loadAssets();
  }, [mode, usageContext, kind]);

  const uploadFile = async (file: File | null) => {
    if (!file) return;
    try {
      setUploading(true);
      setError("");
      const form = new FormData();
      form.append("file", file);
      form.append("usageContext", usageContext);
      if (linkedEntityType) form.append("linkedEntityType", linkedEntityType);
      if (linkedEntityId) form.append("linkedEntityId", linkedEntityId);
      if (altText) form.append("altText", altText);
      if (caption) form.append("caption", caption);
      const payload = await adminMediaFetch("/api/admin/media", { method: "POST", body: form });
      onChange(payload.asset.downloadUrl, payload.asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const addExternalUrl = async () => {
    try {
      setUploading(true);
      setError("");
      const payload = await adminMediaFetch("/api/admin/media", {
        method: "POST",
        body: JSON.stringify({
          url: urlDraft,
          usageContext,
          linkedEntityType,
          linkedEntityId,
          altText,
          caption,
        }),
      });
      onChange(payload.asset.downloadUrl, payload.asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add URL.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white/85">{label}</p>
          {helperText ? <p className="mt-1 text-xs leading-5 text-white/45">{helperText}</p> : null}
          {aspectHint ? <p className="mt-1 text-xs text-cyan-200/70">{aspectHint}</p> : null}
        </div>
        <div className="flex rounded-2xl border border-white/10 bg-black/20 p-1">
          <ModeButton active={mode === "upload"} label="Upload" onClick={() => setMode("upload")} />
          {allowLibrary ? <ModeButton active={mode === "library"} label="Library" onClick={() => setMode("library")} /> : null}
          {allowUrl ? <ModeButton active={mode === "url"} label="URL" onClick={() => setMode("url")} /> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <AdminMediaPreview url={value} kind={selectedKind} onClear={() => onChange("", null)} />
        <div className="space-y-3">
          {mode === "upload" ? (
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/20 p-5 text-center transition hover:border-cyan-300/40 hover:bg-cyan-300/5">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-cyan-200" /> : <Upload className="h-6 w-6 text-cyan-200" />}
              <span className="mt-3 text-sm font-semibold text-white">{uploading ? "Uploading..." : "Upload from device"}</span>
              <span className="mt-1 text-xs text-white/45">Images, videos, audio, PDFs, and documents are supported by context.</span>
              <input ref={inputRef} type="file" accept={accept} disabled={uploading} onChange={(event) => uploadFile(event.target.files?.[0] || null)} className="sr-only" />
            </label>
          ) : null}

          {mode === "library" ? (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white/75">Recent media</p>
                <button type="button" onClick={loadAssets} className="text-xs text-cyan-200 hover:text-cyan-100">Refresh</button>
              </div>
              {loadingAssets ? <p className="py-8 text-center text-sm text-white/45">Loading media...</p> : null}
              {!loadingAssets && assets.length === 0 ? <p className="py-8 text-center text-sm text-white/45">No saved media yet.</p> : null}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => (
                  <button
                    key={asset.assetId}
                    type="button"
                    onClick={() => onChange(asset.downloadUrl, asset)}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left hover:border-cyan-300/40"
                  >
                    <div className="h-24 bg-black/30">
                      <AdminMediaThumb asset={asset} />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-white/75">{asset.fileName}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/35">{asset.kind}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "url" ? (
            <div className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="flex gap-2">
                <input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://..." className="admin-media-input" />
                <button type="button" onClick={addExternalUrl} disabled={uploading || !urlDraft.trim()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  Add
                </button>
              </div>
              <p className="text-xs text-white/40">External URLs are saved into the media library so they can be reused and audited.</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Alt text or accessibility label" className="admin-media-input" />
            <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Internal caption or note" className="admin-media-input" />
          </div>
          {error ? <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        </div>
      </div>

      <style jsx global>{`
        .admin-media-input {
          min-height: 2.75rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.24);
          padding: .7rem .9rem;
          color: white;
          outline: none;
        }
        .admin-media-input:focus { border-color: rgba(34,211,238,.55); }
        .admin-media-input::placeholder { color: rgba(255,255,255,.34); }
      `}</style>
    </div>
  );
}

export function AdminMediaPreview({ url, kind, onClear }: { url?: string; kind?: AdminMediaKind | "all"; onClear?: () => void }) {
  return (
    <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/10 to-violet-500/10">
      {url ? (
        <>
          {kind === "image" || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full min-h-40 w-full object-cover" />
          ) : kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url) ? (
            <video src={url} className="h-full min-h-40 w-full object-cover" controls />
          ) : (
            <div className="p-5 text-center">
              <MediaIcon kind={kind || "unknown"} />
              <p className="mt-3 break-all text-xs text-white/50">{url}</p>
            </div>
          )}
          {onClear ? (
            <button type="button" onClick={onClear} className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/70 p-2 text-white/70 hover:text-white" aria-label="Remove media">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </>
      ) : (
        <div className="p-5 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm text-white/45">No media selected</p>
        </div>
      )}
    </div>
  );
}

function AdminMediaThumb({ asset }: { asset: AdminMediaAsset }) {
  if (asset.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl || asset.downloadUrl} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-white/40">
      <MediaIcon kind={asset.kind} />
    </div>
  );
}

function MediaIcon({ kind }: { kind: AdminMediaKind | "all" }) {
  const Icon = kind === "video" ? Video : kind === "audio" ? Music : kind === "document" ? FileText : kind === "image" ? ImageIcon : LinkIcon;
  return <Icon className="mx-auto h-7 w-7 text-cyan-200/70" />;
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-8 items-center gap-1 rounded-xl px-3 text-xs font-semibold transition ${active ? "bg-cyan-400/15 text-cyan-100" : "text-white/45 hover:text-white"}`}>
      {active ? <Check className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function inferKind(url: string, fallback: AdminMediaKind | "all"): AdminMediaKind | "all" {
  if (fallback !== "all") return fallback;
  if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url)) return "audio";
  if (/\.(pdf|docx?|pptx?|xlsx?|zip)(\?|$)/i.test(url)) return "document";
  return "unknown";
}

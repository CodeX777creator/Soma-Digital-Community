"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Mail, Share2 } from "lucide-react";

type ShareArticleButtonProps = {
  title: string;
  url: string;
};

export function ShareArticleButton({ title, url }: ShareArticleButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text: title, url });
      setOpen(false);
    } catch {
      // Canceling the native share sheet does not need an error message.
    }
  }

  const shareLinks = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
  ];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-semibold text-white/80 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
        <Share2 className="h-4 w-4 text-cyan-300" />
        Share
      </button>
      {open ? (
        <div role="menu" aria-label="Share this article" className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#111827] p-3 shadow-2xl shadow-black/40">
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Share this article</div>
          <div className="grid grid-cols-2 gap-2">
            {canNativeShare ? <button type="button" role="menuitem" onClick={() => void nativeShare()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-left text-sm font-medium text-cyan-100 hover:bg-cyan-300/20"><Share2 className="h-4 w-4" />More options</button> : null}
            {shareLinks.map((link) => <a key={link.label} role="menuitem" href={link.href} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-lg border border-white/10 px-3 text-sm font-medium text-white/75 hover:border-cyan-300/30 hover:bg-white/[0.05] hover:text-white">{link.label}<ExternalLink className="h-3.5 w-3.5 text-white/35" /></a>)}
            <a role="menuitem" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`} onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-lg border border-white/10 px-3 text-sm font-medium text-white/75 hover:border-cyan-300/30 hover:bg-white/[0.05] hover:text-white">Email<Mail className="h-3.5 w-3.5 text-white/35" /></a>
            <button type="button" role="menuitem" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center justify-between gap-2 rounded-lg border border-white/10 px-3 text-left text-sm font-medium text-white/75 hover:border-cyan-300/30 hover:bg-white/[0.05] hover:text-white">{copied ? "Copied" : "Copy link"}{copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5 text-white/35" />}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

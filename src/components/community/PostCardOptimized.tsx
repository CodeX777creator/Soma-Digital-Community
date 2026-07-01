"use client";

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Pin, Trophy, ShieldCheck, Link as LinkIcon, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Post } from "@/lib/db";
import { cn } from "@/lib/utils";
import { OptimizedImage } from "@/components/ui/optimized-image";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: any): string {
  if (!ts?.toDate) return "just now";
  const diff = Date.now() - ts.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TIER_RING: Record<string, string> = {
  explorer: "border-white/20",
  pro: "border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]",
  elite: "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]",
};

const POST_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  win: { label: "Founder Win", icon: "🏆", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  insight: { label: "Insight", icon: "💡", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  mentorship: { label: "Mentorship", icon: "🤝", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  announcement: { label: "Announcement", icon: "📢", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  question: { label: "Question", icon: "❓", color: "text-green-400 bg-green-400/10 border-green-400/20" },
};

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// ─── Memoized Components ─────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
}

// Memoized to prevent unnecessary re-renders
export const PostCardOptimized = memo(function PostCardOptimized({ post }: PostCardProps) {
  const meta = useMemo(() => POST_TYPE_META[post.type] || POST_TYPE_META.insight, [post.type]);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <GlassCard
        className={cn(
          "p-6 rounded-3xl transition-all duration-300 hover:translate-y-[-2px] hover:shadow-xl hover:shadow-black/30",
          post.isPinned && "border-primary/40 bg-primary/[0.03]"
        )}
      >
        {/* Pinned indicator */}
        {post.isPinned && (
          <div className="flex items-center gap-2 mb-4 text-[10px] font-bold text-primary uppercase tracking-widest">
            <Pin className="w-3 h-3 fill-primary" /> Pinned
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex gap-3 items-center">
            <div className="relative">
              <div
                className={cn(
                  "w-12 h-12 rounded-2xl overflow-hidden border-2 p-0.5",
                  TIER_RING[post.authorTier]
                )}
              >
                <OptimizedImage
                  src={post.authorAvatar || ""}
                  alt={post.authorName}
                  containerClassName="w-full h-full rounded-xl"
                  className="w-full h-full object-cover"
                />
              </div>
              {post.type === "win" && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-[#0d1117] shadow-lg">
                  <Trophy className="w-3 h-3 text-black" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm text-white hover:text-primary cursor-pointer transition-colors leading-none">
                  {post.authorName}
                </h4>
                {post.isFounder && (
                  <span title="Founder">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  </span>
                )}
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border",
                    meta.color
                  )}
                >
                  {meta.icon} {meta.label}
                </span>
                {post.isEdited && (
                  <span
                    className="text-[9px] text-muted-foreground cursor-help"
                    title={post.editedAt ? `Edited ${timeAgo(post.editedAt)}` : "Edited"}
                  >
                    (edited)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight mt-1">
                {post.authorRole} · {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-5">
          <p className="text-white/90 leading-relaxed text-[15px] whitespace-pre-wrap">{
            // SECURITY: Escape HTML entities to prevent XSS
            post.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#x27;')
          }</p>
          {post.imageUrl && (
            <div className="relative group cursor-pointer w-fit">
              <div className="relative rounded-xl overflow-hidden border border-white/10">
                <OptimizedImage
                  src={post.imageUrl}
                  alt="Post media"
                  containerClassName="w-48 h-48"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          )}
          {post.linkUrl && (() => {
            // SECURITY: Validate URL before rendering
            let hostname = 'External Link';
            let isSafeUrl = false;
            try {
              const url = new URL(post.linkUrl);
              // Only allow http and https protocols
              if (url.protocol === 'http:' || url.protocol === 'https:') {
                hostname = url.hostname;
                isSafeUrl = true;
              }
            } catch {
              // Invalid URL, don't render as clickable link
            }
            
            if (!isSafeUrl) {
              return (
                <span className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                  <LinkIcon className="w-4 h-4" />
                  Invalid Link
                </span>
              );
            }
            
            return (
              <a
                href={post.linkUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary transition hover:border-primary/30 hover:bg-white/10"
              >
                <LinkIcon className="w-4 h-4" />
                {hostname}
              </a>
            );
          })()}
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold text-primary/70 hover:text-primary cursor-pointer transition-colors uppercase tracking-wider"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-5 pt-4 border-t border-white/5">
          <span className="flex items-center gap-2 text-muted-foreground text-xs font-bold">
            👍 {formatCount(post.likeCount)}
          </span>
          <span className="flex items-center gap-2 text-muted-foreground text-xs font-bold">
            💬 {formatCount(post.commentCount)}
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
});

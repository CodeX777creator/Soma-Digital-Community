"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Share2, MoreHorizontal, Pin, Trophy, ShieldCheck, ChevronDown, ChevronUp, Link as LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Post, ReactionType, postService } from "@/lib/db";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { ReactionPicker, REACTIONS } from "./ReactionPicker";
import { CommentThread } from "./CommentThread";
import { UserAvatar } from "@/components/ui/user-avatar";

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
  pro:      "border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]",
  elite:    "border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.3)]",
};

const POST_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  win:          { label: "Founder Win",    icon: "🏆", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  insight:      { label: "Insight",        icon: "💡", color: "text-blue-400 bg-blue-400/10 border-blue-400/20"     },
  mentorship:   { label: "Mentorship",     icon: "🤝", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  announcement: { label: "Announcement",  icon: "📢", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20"    },
  question:     { label: "Question",       icon: "❓", color: "text-green-400 bg-green-400/10 border-green-400/20"  },
};

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { user, userData } = useAuth();

  // ── Optimistic reaction state ─────────────────────────────────────────────
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [localLikeCount, setLocalLikeCount] = useState(post.likeCount);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerLocked, setPickerLocked] = useState(false); // debounce lock
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Comments toggle ───────────────────────────────────────────────────────
  const [showComments, setShowComments] = useState(false);

  // Subscribe to user's current reaction from Firestore (eventual truth)
  useEffect(() => {
    if (!user) return;
    const unsub = postService.subscribeToUserReaction(post.id, user.uid, (r) => {
      setMyReaction(r);
    });
    return unsub;
  }, [post.id, user]);

  // Keep local count in sync with Firestore when not mid-interaction
  useEffect(() => {
    setLocalLikeCount(post.likeCount);
  }, [post.likeCount]);

  const handleReaction = useCallback((type: ReactionType) => {
    if (!user || !userData || pickerLocked) return;

    // Debounce: lock for 350ms
    setPickerLocked(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPickerLocked(false), 350);

    // Optimistic UI
    const isSame = myReaction === type;
    const hadReaction = myReaction !== null;

    if (isSame) {
      // Toggling off
      setMyReaction(null);
      setLocalLikeCount(c => Math.max(0, c - 1));
    } else if (hadReaction) {
      // Swapping
      setMyReaction(type);
      // Count stays the same (swap)
    } else {
      // New reaction
      setMyReaction(type);
      setLocalLikeCount(c => c + 1);
    }

    setShowPicker(false);

    // Firestore sync (background)
    const targetReaction = isSame ? null : type;
    postService.setReaction(post.id, user.uid, targetReaction).catch(() => {
      // Revert on failure
      setMyReaction(myReaction);
      setLocalLikeCount(post.likeCount);
    });
  }, [user, userData, myReaction, pickerLocked, post.id, post.likeCount]);

  // Hover timer logic
  const handleMouseEnterLike = () => {
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    pickerTimerRef.current = setTimeout(() => setShowPicker(true), 350);
  };
  const handleMouseLeaveLike = () => {
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    pickerTimerRef.current = setTimeout(() => setShowPicker(false), 300);
  };

  const meta = POST_TYPE_META[post.type] || POST_TYPE_META.insight;
  const activeReactionEmoji = myReaction ? REACTIONS.find(r => r.type === myReaction)?.emoji : null;
  const activeReactionColor = myReaction ? REACTIONS.find(r => r.type === myReaction)?.color : null;

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
              <UserAvatar 
                src={post.authorAvatar} 
                name={post.authorName} 
                size="md"
                className={cn("rounded-2xl border-2 p-0.5", TIER_RING[post.authorTier])} 
              />
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
                  <span title="Founder"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /></span>
                )}
                <span className={cn(
                  "text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border",
                  meta.color
                )}>
                  {meta.icon} {meta.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight mt-1">
                {post.authorRole} · {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>
          <Button 
            title="Post options" 
            aria-label="Post options" 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground h-8 w-8 hover:bg-white/5 rounded-full shrink-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-5">
          <p className="text-white/90 leading-relaxed text-[15px]">{post.content}</p>
          {post.imageUrl && (
            <div className="rounded-2xl overflow-hidden border border-white/5 group cursor-zoom-in">
              <img
                src={post.imageUrl}
                alt="Post media"
                title="Post media"
                className="w-full aspect-video object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
          )}
          {post.linkUrl && (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary transition hover:border-primary/30 hover:bg-white/10"
            >
              <LinkIcon className="w-4 h-4" />
              {new URL(post.linkUrl).hostname}
            </a>
          )}
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {post.tags.map(tag => (
              <span key={tag} className="text-[10px] font-bold text-primary/70 hover:text-primary cursor-pointer transition-colors uppercase tracking-wider">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-5 pt-4 border-t border-white/5">
          {/* Reaction button with hover picker */}
          <div
            className="relative"
            onMouseEnter={handleMouseEnterLike}
            onMouseLeave={handleMouseLeaveLike}
          >
            <ReactionPicker visible={showPicker} onSelect={handleReaction} />
            <button
              onClick={() => handleReaction(myReaction ? myReaction : "like")}
              disabled={!user}
              className={cn(
                "flex items-center gap-2 transition-all group/like",
                myReaction ? activeReactionColor : "text-muted-foreground hover:text-red-400",
                "disabled:opacity-40"
              )}
            >
              <motion.span
                className="text-xl leading-none select-none"
                animate={myReaction ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {activeReactionEmoji ?? "👍"}
              </motion.span>
              <span className="text-xs font-bold tabular-nums">
                {formatCount(localLikeCount)}
              </span>
            </button>
          </div>

          {/* Comments */}
          <button
            onClick={() => setShowComments(v => !v)}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-all group"
          >
            <MessageSquare className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="text-xs font-bold">{formatCount(post.commentCount)}</span>
          </button>

          {/* Share */}
          <button 
            title="Share post" 
            aria-label="Share post" 
            className="flex items-center gap-2 text-muted-foreground hover:text-cyan-400 transition-all group ml-auto"
          >
            <Share2 className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </div>

        {/* Comment thread */}
        <AnimatePresence>
          {showComments && (
            <div className="mt-4">
              <CommentThread postId={post.id} initialCount={post.commentCount} />
            </div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

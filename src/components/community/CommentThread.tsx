"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown } from "lucide-react";
import { Comment, postService } from "@/lib/db";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { awardXP } from "@/lib/xp";
import { createNotification } from "@/lib/notifications";

const TIER_COLORS: Record<string, string> = {
  explorer: "border-white/20",
  pro:      "border-cyan-400/60",
  elite:    "border-yellow-400/60",
};

function timeAgo(timestamp: any): string {
  if (!timestamp?.toDate) return "just now";
  const diff = Date.now() - timestamp.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface CommentThreadProps {
  postId: string;
  initialCount: number;
}

export function CommentThread({ postId, initialCount }: CommentThreadProps) {
  const { user, userData } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = postService.subscribeToComments(postId, setComments);
    return unsub;
  }, [postId]);

  const shown = expanded ? comments : comments.slice(0, 3);
  const hiddenCount = comments.length - 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || !userData) return;
    setSubmitting(true);
    const optimisticComment: Comment = {
      id: `optimistic-${Date.now()}`,
      postId,
      authorId: user.uid,
      authorName: userData.name || user.displayName || "You",
      authorAvatar: user.photoURL || "",
      authorTier: userData.tier,
      content: input,
      createdAt: null,
    };
    setComments(prev => [...prev, optimisticComment]);
    setInput("");
    try {
      await postService.addComment(postId, user.uid, {
        name: userData.name || user.displayName || "Anonymous",
        photoURL: user.photoURL || undefined,
        tier: userData.tier,
      }, optimisticComment.content);

      const post = await postService.getPost(postId);
      if (post && post.authorId && post.authorId !== user.uid) {
        await createNotification(
          post.authorId,
          'comment',
          'New comment on your post',
          `${userData.name || user.displayName || 'Someone'} left a comment on your post.`,
          `/community?post=${postId}`
        );
      }

      await awardXP(user.uid, 5, 'comment', { postId });
    } catch {
      // Revert optimistic comment
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
      setInput(optimisticComment.content);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="pt-4 border-t border-white/5 space-y-4"
    >
      {/* Comment list */}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {shown.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex gap-3"
            >
              <div className={cn("w-7 h-7 rounded-xl border shrink-0 overflow-hidden", TIER_COLORS[c.authorTier])}>
                <img src={c.authorAvatar} alt={c.authorName} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 bg-white/[0.03] rounded-2xl px-4 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold text-white">{c.authorName}</span>
                  <span className="text-[9px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">{c.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty state */}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground/60 italic text-center py-2">
            Be the first to spark this discussion.
          </p>
        )}

        {/* Show more */}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-10"
          >
            <ChevronDown className="w-3 h-3" /> Show {hiddenCount} more comment{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Input */}
      {user && (
        <form onSubmit={handleSubmit} className="flex gap-3 items-center">
          <div className="w-7 h-7 rounded-xl border border-white/10 shrink-0 overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User Avatar"} title={user.displayName || "User Avatar"} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/10" />
            )}
          </div>
          <div className="flex-1 flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-2xl px-4 pr-2 focus-within:border-primary/40 transition-colors">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-xs text-white py-2.5 placeholder:text-muted-foreground/50 outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || submitting}
              title="Send comment"
              aria-label="Send comment"
              className="w-7 h-7 rounded-xl bg-primary disabled:opacity-30 flex items-center justify-center transition-all hover:bg-primary/90 active:scale-95 shrink-0"
            >
              <Send className="w-3 h-3 text-white" />
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
}

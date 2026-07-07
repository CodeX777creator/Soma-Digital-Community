"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Link as LinkIcon,
  MessageCircle,
  Pin,
  ShieldCheck,
  ThumbsUp,
  Trophy,
  ZoomIn,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PostOptionsMenu } from "./PostOptionsMenu";
import { useToast } from "@/hooks/use-toast";
import { createNotification } from "@/lib/notifications";
import { Post, ReactionType, postService } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { CommentThread } from "./CommentThread";
import { ReactionPicker, REACTIONS } from "./ReactionPicker";

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

const POST_TYPE_META: Record<string, { label: string; color: string }> = {
  win: { label: "Founder Win", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  insight: { label: "Insight", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  mentorship: { label: "Mentorship", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  announcement: { label: "Announcement", color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  question: { label: "Question", color: "text-green-400 bg-green-400/10 border-green-400/20" },
};

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

interface PostCardProps {
  post: Post;
  onEdit?: (post: Post) => void;
  onDelete?: (postId: string, post?: Post) => void;
  isPendingDelete?: boolean;
}

export const PostCardOptimized = memo(function PostCardOptimized({ post, onEdit, onDelete, isPendingDelete }: PostCardProps) {
  const meta = useMemo(() => POST_TYPE_META[post.type] || POST_TYPE_META.insight, [post.type]);
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const [currentReaction, setCurrentReaction] = useState<ReactionType | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isReacting, setIsReacting] = useState(false);

  useEffect(() => {
    if (!user) {
      setCurrentReaction(null);
      return;
    }

    return postService.subscribeToUserReaction(post.id, user.uid, setCurrentReaction);
  }, [post.id, user]);

  const reactionMeta = REACTIONS.find((reaction) => reaction.type === currentReaction);

  const handleReaction = async (reaction: ReactionType | null) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to react to posts." });
      return;
    }

    setIsReacting(true);
    const shouldNotify =
      !!reaction &&
      !currentReaction &&
      !!post.authorId &&
      post.authorId !== user.uid;

    try {
      await postService.setReaction(post.id, user.uid, reaction);

      if (shouldNotify) {
        const actorName = userData?.name || user.displayName || "Someone";
        createNotification(
          post.authorId,
          "like",
          "New reaction on your post",
          `${actorName} reacted to your community post.`,
          `/community?post=${post.id}`,
          user.uid
        ).catch((error) => {
          console.error("Failed to create reaction notification:", error);
        });
      }
    } catch (error) {
      console.error("Failed to update reaction:", error);
      toast({ title: "Reaction failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsReacting(false);
      setShowReactionPicker(false);
    }
  };

  const handleQuickLike = () => {
    handleReaction(currentReaction ? null : "like");
  };

  const safeLink = useMemo(() => {
    if (!post.linkUrl) return null;

    try {
      const url = new URL(post.linkUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return { href: post.linkUrl, hostname: url.hostname };
    } catch {
      return null;
    }
  }, [post.linkUrl]);

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
          "p-6 rounded-3xl transition-all duration-300 hover:translate-y-[-2px] hover:shadow-xl hover:shadow-black/30 relative",
          post.isPinned && "border-primary/40 bg-primary/[0.03]",
          isPendingDelete && "opacity-50"
        )}
      >
        {/* Loading overlay for pending delete */}
        {isPendingDelete && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-3xl flex items-center justify-center z-10">
            <div className="flex items-center gap-3 text-white/90">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Deleting...</span>
            </div>
          </div>
        )}
        
        {post.isPinned && (
          <div className="flex items-center gap-2 mb-4 text-[10px] font-bold text-primary uppercase tracking-widest">
            <Pin className="w-3 h-3 fill-primary" /> Pinned
          </div>
        )}

        <div className="flex items-start justify-between mb-5">
          <div className="flex gap-3 items-center flex-1">
            <div className="relative">
              <div className={cn("w-12 h-12 rounded-2xl overflow-hidden border-2 p-0.5", TIER_RING[post.authorTier])}>
                <UserAvatar
                  src={post.authorAvatar || null}
                  name={post.authorName}
                  size="md"
                  className="rounded-2xl !w-full !h-full border-0"
                />
              </div>
              {post.type === "win" && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-[#0d1117] shadow-lg">
                  <Trophy className="w-3 h-3 text-black" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm text-white hover:text-primary cursor-pointer transition-colors leading-none truncate">
                  {post.authorName}
                </h4>
                {post.isFounder && (
                  <span title="Founder">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  </span>
                )}
                <span className={cn("text-[9px] font-bold uppercase px-2 py-0.5 rounded-md border flex-shrink-0", meta.color)}>
                  {meta.label}
                </span>
                {post.isEdited && (
                  <span className="text-[9px] text-muted-foreground flex-shrink-0" title={post.editedAt ? `Edited ${timeAgo(post.editedAt)}` : "Edited"}>
                    (edited)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight mt-1 truncate">
                {post.authorRole} - {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>
          
          <PostOptionsMenu 
            post={post}
            onEdit={() => onEdit?.(post)}
            onDelete={(postId, postObj) => onDelete?.(postId, postObj)}
            onPin={() => {
              toast({
                title: "Pin post",
                description: "Pin functionality will be triggered here.",
              });
            }}
            isAdmin={userData?.role === 'admin'}
          />
        </div>

        <div className="space-y-4 mb-5">
          <p className="text-white/90 leading-relaxed text-[15px] whitespace-pre-wrap">
            {post.content}
          </p>

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

          {post.linkUrl && !safeLink && (
            <span className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
              <LinkIcon className="w-4 h-4" />
              Invalid Link
            </span>
          )}

          {safeLink && (
            <a
              href={safeLink.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary transition hover:border-primary/30 hover:bg-white/10"
            >
              <LinkIcon className="w-4 h-4" />
              {safeLink.hostname}
            </a>
          )}
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="border-white/10 text-primary/80">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/5">
          <div
            className="relative"
            onMouseEnter={() => user && setShowReactionPicker(true)}
            onMouseLeave={() => setShowReactionPicker(false)}
          >
            <ReactionPicker visible={showReactionPicker} onSelect={handleReaction} />
            <button
              type="button"
              onClick={handleQuickLike}
              disabled={isReacting}
              className={cn(
                "flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold transition-all hover:border-primary/30 hover:bg-primary/10 disabled:opacity-60",
                currentReaction ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground hover:text-white"
              )}
              aria-label={currentReaction ? "Remove reaction" : "Like post"}
            >
              {reactionMeta ? (
                <span className="text-sm leading-none">{reactionMeta.emoji}</span>
              ) : (
                <ThumbsUp className="w-4 h-4" />
              )}
              {formatCount(post.likeCount)}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowComments((value) => !value)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold transition-all hover:border-primary/30 hover:bg-primary/10",
              showComments ? "bg-white/5 text-white border-white/20" : "text-muted-foreground hover:text-white"
            )}
            aria-expanded={showComments ? "true" : "false"}
            aria-label={showComments ? "Hide comments" : "Show comments"}
          >
            <MessageCircle className="w-4 h-4" />
            {formatCount(post.commentCount)}
          </button>
        </div>

        {showComments && <CommentThread postId={post.id} initialCount={post.commentCount} />}
      </GlassCard>
    </motion.div>
  );
});

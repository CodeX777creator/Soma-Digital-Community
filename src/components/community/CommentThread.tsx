"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, CornerDownRight, MessageCircle } from "lucide-react";
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


function formatContent(content: string): { __html: string } {
  if (!content) return { __html: '' };

  // SECURITY FIX: Step 1 - Block control characters
  let sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Step 2: Escape ALL HTML entities FIRST
  // This prevents any HTML from being interpreted
  let escaped = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Step 3: Convert URLs to clickable links (on the ALREADY escaped content)
  // SECURITY FIX: Use stricter URL regex - only match https:// in production
  const isDev = process.env.NODE_ENV === 'development';
  const urlRegex = isDev 
    ? /(\bhttps?:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi
    : /(\bhttps:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi; // Only https in production

  escaped = escaped.replace(urlRegex, (match) => {
    try {
      // SECURITY FIX: Unescape the URL for validation
      const unescapedUrl = match
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
      
      const url = new URL(unescapedUrl);

      // Strict protocol check
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return match;
      }

      // SECURITY FIX: Enhanced dangerous pattern detection
      const lowerHref = url.toString().toLowerCase();
      const dangerousPatterns = [
        'javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'blob:',
        'javascript%3a', 'data%3a', // URL encoded
        'onerror=', 'onload=', 'onclick=', 'onmouse',
        '<script', 'eval(', 'expression(',
      ];
      
      if (dangerousPatterns.some(pattern => lowerHref.includes(pattern))) {
        return match;
      }

      // SECURITY FIX: Block localhost/private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const lowerHostname = url.hostname.toLowerCase();
        if (
          lowerHostname === 'localhost' ||
          lowerHostname === '127.0.0.1' ||
          lowerHostname.startsWith('192.168.') ||
          lowerHostname.startsWith('10.') ||
          lowerHostname.startsWith('172.')
        ) {
          return match;
        }
      }

      // SECURITY FIX: Re-escape the URL for the href attribute
      const href = url.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      // Truncate display text
      const displayText = match.length > 60 
        ? match.substring(0, 57) + '...' 
        : match;

      return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="text-primary hover:underline break-all">${displayText}</a>`;
    } catch {
      return match;
    }
  });

  // Step 4: Convert line breaks to <br> tags
  escaped = escaped.replace(/\n/g, '<br>');

  return { __html: escaped };
}

interface CommentThreadProps {
  postId: string;
  initialCount: number;
}

// Individual comment component with reply support
function CommentItem({ 
  comment, 
  postId, 
  depth = 0 
}: { 
  comment: Comment; 
  postId: string;
  depth?: number;
}) {
  const { user, userData } = useAuth();
  const [replies, setReplies] = useState<Comment[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Subscribe to replies for this comment
  useEffect(() => {
    if (!comment.id || depth > 2) return; // Limit nesting to 3 levels
    const unsub = postService.subscribeToReplies(postId, comment.id, setReplies);
    return unsub;
  }, [comment.id, postId, depth]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyInput.trim() || !user) return;
    
    setSubmitting(true);
    try {
      await postService.addReply(postId, comment.id, user.uid, {
        name: userData?.name || user.displayName || "Anonymous",
        photoURL: user.photoURL || undefined,
        tier: userData?.tier || 'explorer',
      }, replyInput);
      
      setReplyInput("");
      setIsReplying(false);
      setShowReplies(true);
      
      // Award XP for replying
      await awardXP(user.uid, 3, 'reply', { postId, parentCommentId: comment.id });
      
      // Notify parent comment author
      if (comment.authorId !== user.uid) {
        await createNotification(
          comment.authorId,
          'reply',
          'New reply to your comment',
          `${userData?.name || user.displayName || 'Someone'} replied to your comment.`,
          `/community?post=${postId}`
        );
      }
    } catch (err) {
      console.error('Failed to add reply:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const maxDepth = 2; // Max 3 levels of nesting (0, 1, 2)
  const canReply = depth < maxDepth && !!user;

  return (
    <div className={cn("flex gap-3", depth > 0 && "ml-8 mt-2")}>
      <div className={cn("w-7 h-7 rounded-xl border shrink-0 overflow-hidden", TIER_COLORS[comment.authorTier])}>
        <img src={comment.authorAvatar} alt={comment.authorName} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1">
        <div className="bg-white/[0.03] rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-white">{comment.authorName}</span>
            <span className="text-[9px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          </div>
          <p 
            className="text-xs text-white/80 leading-relaxed"
            dangerouslySetInnerHTML={formatContent(comment.content)}
          />
        </div>
        
        {/* Reply actions */}
        {canReply && (
          <div className="flex items-center gap-3 mt-1 ml-2">
            <button 
              onClick={() => setIsReplying(!isReplying)}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              aria-label={isReplying ? "Cancel reply" : "Reply to comment"}
            >
              <MessageCircle className="w-3 h-3" />
              Reply
            </button>
            
            {comment.replyCount && comment.replyCount > 0 && (
              <button 
                onClick={() => setShowReplies(!showReplies)}
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
                aria-label={showReplies ? "Hide replies" : `Show ${comment.replyCount} replies`}
              >
                <CornerDownRight className="w-3 h-3" />
                {showReplies ? 'Hide' : 'Show'} {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
        )}
        
        {/* Reply input */}
        {isReplying && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleReply}
            className="flex gap-2 items-center mt-2 ml-2"
          >
            <input
              value={replyInput}
              onChange={e => setReplyInput(e.target.value)}
              placeholder={`Reply to ${comment.authorName}...`}
              className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-muted-foreground/50 outline-none focus:border-primary/40"
              autoFocus
            />
            <button
              type="submit"
              disabled={!replyInput.trim() || submitting}
              aria-label="Send reply"
              className="w-7 h-7 rounded-lg bg-primary disabled:opacity-30 flex items-center justify-center transition-all hover:bg-primary/90"
            >
              <Send className="w-3 h-3 text-white" />
            </button>
            <button
              type="button"
              onClick={() => setIsReplying(false)}
              aria-label="Cancel reply"
              className="text-[10px] text-muted-foreground hover:text-white"
            >
              Cancel
            </button>
          </motion.form>
        )}
        
        {/* Nested replies */}
        {showReplies && replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {replies.map(reply => (
              <CommentItem 
                key={reply.id} 
                comment={reply} 
                postId={postId} 
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
    console.log('[CommentThread] Submitting comment:', { input: input.trim(), hasUser: !!user, hasUserData: !!userData });
    
    if (!input.trim() || !user) {
      console.log('[CommentThread] Missing required data, returning');
      return;
    }
    
    setSubmitting(true);
    const optimisticComment: Comment = {
      id: `optimistic-${Date.now()}`,
      postId,
      authorId: user.uid,
      authorName: userData?.name || user.displayName || "You",
      authorAvatar: user.photoURL || "",
      authorTier: userData?.tier || 'explorer',
      content: input,
      createdAt: null,
    };
    setComments(prev => [...prev, optimisticComment]);
    setInput("");
    
    try {
      console.log('[CommentThread] Calling addComment');
      await postService.addComment(postId, user.uid, {
        name: userData?.name || user.displayName || "Anonymous",
        photoURL: user.photoURL || undefined,
        tier: userData?.tier || 'explorer',
      }, optimisticComment.content);
      console.log('[CommentThread] addComment successful');

      const post = await postService.getPost(postId);
      if (post && post.authorId && post.authorId !== user.uid) {
        await createNotification(
          post.authorId,
          'comment',
          'New comment on your post',
          `${userData?.name || user.displayName || 'Someone'} left a comment on your post.`,
          `/community?post=${postId}`
        );
      }

      await awardXP(user.uid, 5, 'comment', { postId });
    } catch (err) {
      console.error('[CommentThread] Failed to add comment:', err);
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
          {shown.filter(c => !c.parentId).map(c => ( // Only show top-level comments
            <CommentItem key={c.id} comment={c} postId={postId} depth={0} />
          ))}
        </AnimatePresence>

        {/* Empty state */}
        {comments.filter(c => !c.parentId).length === 0 && (
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

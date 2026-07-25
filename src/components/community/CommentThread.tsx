"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronDown, CornerDownRight, MessageCircle, Smile, ImageIcon, Sticker, Loader2, X } from "lucide-react";
import { Comment, postService } from "@/lib/db";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { awardXPAction } from "@/lib/xp";
import { normalizeDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const TIER_COLORS: Record<string, string> = {
  explorer: "border-white/20",
  pro:      "border-cyan-400/60",
  elite:    "border-yellow-400/60",
};

function timeAgo(timestamp: any): string {
  const date = normalizeDate(timestamp);
  if (!date) return "just now";
  const diff = Date.now() - date.getTime();
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

const EMOJI_OPTIONS = [
  "😀", "😂", "😍", "🤔", "👏", "🙌", "🔥", "💡", "❤️", "💯", "🚀", "🎉",
  "👍", "👎", "🙏", "💪", "✨", "😅", "😮", "🥳", "💬", "✅", "🎯", "🌟",
];

type SelectedGif = {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  mediaType: "gif" | "sticker";
};

function EmojiMenu({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 grid w-[min(280px,calc(100vw-48px))] grid-cols-8 gap-1 rounded-2xl border border-white/10 bg-[#111827] p-3 shadow-2xl shadow-black/40">
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-white/10"
          aria-label={`Insert ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function GifMenu({ onSelect, onClose, kind = "gif" }: { onSelect: (gif: SelectedGif) => void; onClose: () => void; kind?: "gif" | "sticker" }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<SelectedGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  const search = async (term = query) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/community/gifs/search?q=${encodeURIComponent(term)}&limit=12&kind=${kind}`);
      const payload = await response.json();
      setGifs(Array.isArray(payload.gifs) ? payload.gifs : []);
      setConfigured(payload.configured !== false);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void search("");
  }, []);

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#111827] p-3 shadow-2xl shadow-black/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
        <p className="text-xs font-semibold text-white">Add a {kind === "sticker" ? "sticker" : "GIF"}</p>
          <p className="mt-0.5 text-[10px] text-white/45">Keep the conversation expressive.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close GIF picker">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="mb-3 flex gap-2"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs..."
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-primary/50"
        />
        <button type="submit" className="rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90">Search</button>
      </form>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : gifs.length > 0 ? (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {gifs.map((gif) => (
            <button key={gif.id} type="button" onClick={() => onSelect({ ...gif, mediaType: kind })} className="group aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/20 hover:border-primary/60" aria-label={`Use ${gif.title}`}>
              <img src={gif.previewUrl || gif.url} alt={gif.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            </button>
          ))}
        </div>
      ) : (
        <p className="py-5 text-center text-[11px] text-white/45">
            {configured ? `No ${kind}s found. Try another search.` : `${kind === "sticker" ? "Sticker" : "GIF"} search needs a Giphy API key.`}
        </p>
      )}
    </div>
  );
}

function SelectedGifPreview({ gif, onRemove }: { gif: SelectedGif; onRemove: () => void }) {
  return (
    <div className="relative mt-2 w-fit overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <img src={gif.previewUrl || gif.url} alt={gif.title} className="max-h-32 max-w-[220px] object-cover" />
          <button type="button" onClick={onRemove} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black" aria-label="Remove selected media">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ComposerTools({ onEmoji, onSelectGif, onToggleGif, gifOpen, onSelectSticker, onToggleSticker, stickerOpen, disabled }: { onEmoji: (emoji: string) => void; onSelectGif: (gif: SelectedGif) => void; onToggleGif: () => void; gifOpen: boolean; onSelectSticker: (sticker: SelectedGif) => void; onToggleSticker: () => void; stickerOpen: boolean; disabled?: boolean }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  return (
      <div className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1">
      {emojiOpen ? <EmojiMenu onSelect={(emoji) => { onEmoji(emoji); setEmojiOpen(false); }} /> : null}
      {gifOpen ? <GifMenu onSelect={(gif) => { onSelectGif(gif); onToggleGif(); }} onClose={onToggleGif} /> : null}
      {stickerOpen ? <GifMenu kind="sticker" onSelect={(sticker) => { onSelectSticker(sticker); onToggleSticker(); }} onClose={onToggleSticker} /> : null}
        <button type="button" disabled={disabled} onClick={() => setEmojiOpen((value) => !value)} className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Add emoji" title="Add emoji">
        <Smile className="h-3.5 w-3.5" /><span className="sr-only">Emoji</span>
      </button>
        <button type="button" disabled={disabled} onClick={onToggleGif} className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[10px] font-semibold text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Add GIF" title="Add GIF">
        <ImageIcon className="h-3.5 w-3.5" /> GIF
      </button>
        <button type="button" disabled={disabled} onClick={onToggleSticker} className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[10px] font-semibold text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-30" aria-label="Add sticker" title="Add sticker">
        <Sticker className="h-3.5 w-3.5" /> Sticker
      </button>
    </div>
  );
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
  const [replyGif, setReplyGif] = useState<SelectedGif | null>(null);
  const [replyGifOpen, setReplyGifOpen] = useState(false);
  const [replySticker, setReplySticker] = useState<SelectedGif | null>(null);
  const [replyStickerOpen, setReplyStickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Subscribe to replies for this comment
  useEffect(() => {
    if (!comment.id || depth > 2) return; // Limit nesting to 3 levels
    const unsub = postService.subscribeToReplies(postId, comment.id, setReplies);
    return unsub;
  }, [comment.id, postId, depth]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!replyInput.trim() && !replyGif && !replySticker) || !user) return;
    
    setSubmitting(true);
    try {
      const replyId = await postService.addReply(postId, comment.id, user.uid, {
        name: userData?.name || user.displayName || "Anonymous",
        photoURL: user.photoURL || undefined,
        tier: userData?.tier || 'explorer',
      }, replyInput, (replyGif || replySticker) ? { type: (replyGif || replySticker)!.mediaType, url: (replyGif || replySticker)!.url, previewUrl: (replyGif || replySticker)!.previewUrl, alt: (replyGif || replySticker)!.title } : undefined);
      
      setReplyInput("");
      setReplyGif(null);
      setReplySticker(null);
      setIsReplying(false);
      setShowReplies(true);
      
      // Award XP for replying
      await awardXPAction('community_reply_created', {
        resourceId: replyId,
        metadata: { postId, parentCommentId: comment.id },
      });
    } catch (err) {
      logger.warn('Failed to add reply', { error: err instanceof Error ? err.message : String(err), postId });
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
          {comment.content ? (
            <p
              className="text-xs leading-relaxed text-white/80"
              dangerouslySetInnerHTML={formatContent(comment.content)}
            />
          ) : null}
          {comment.mediaUrl ? (
            <img
              src={comment.mediaPreviewUrl || comment.mediaUrl}
              alt={comment.mediaAlt || "Community GIF"}
              loading="lazy"
              className="mt-2 max-h-56 max-w-full rounded-xl border border-white/10 object-cover"
            />
          ) : null}
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
            className="relative mt-2 ml-2 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
          >
            <div className="col-start-1 row-start-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-primary/40">
              <input
                value={replyInput}
                onChange={e => setReplyInput(e.target.value)}
                placeholder={`Reply to ${comment.authorName}...`}
                className="w-full bg-transparent py-2 text-xs text-white outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
              {replyGif ? <SelectedGifPreview gif={replyGif} onRemove={() => setReplyGif(null)} /> : null}
              {replySticker ? <SelectedGifPreview gif={replySticker} onRemove={() => setReplySticker(null)} /> : null}
            </div>
            <button
              type="submit"
              disabled={(!replyInput.trim() && !replyGif && !replySticker) || submitting}
              aria-label="Send reply"
              className="col-start-2 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-lg bg-primary transition-all hover:bg-primary/90 disabled:opacity-30"
            >
              <Send className="w-3 h-3 text-white" />
            </button>
            <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-1">
              <ComposerTools
                onEmoji={(emoji) => setReplyInput((value) => `${value}${emoji}`)}
                onSelectGif={setReplyGif}
                onToggleGif={() => setReplyGifOpen((value) => !value)}
                gifOpen={replyGifOpen}
                onSelectSticker={setReplySticker}
                onToggleSticker={() => setReplyStickerOpen((value) => !value)}
                stickerOpen={replyStickerOpen}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setIsReplying(false)}
                aria-label="Cancel reply"
                className="shrink-0 whitespace-nowrap px-1 text-[10px] text-muted-foreground hover:text-white"
              >
                Cancel
              </button>
            </div>
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
  const [commentGif, setCommentGif] = useState<SelectedGif | null>(null);
  const [commentGifOpen, setCommentGifOpen] = useState(false);
  const [commentSticker, setCommentSticker] = useState<SelectedGif | null>(null);
  const [commentStickerOpen, setCommentStickerOpen] = useState(false);
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
    if ((!input.trim() && !commentGif && !commentSticker) || !user) {
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
      mediaType: commentGif ? "gif" : undefined,
      mediaUrl: commentGif?.url,
      mediaPreviewUrl: commentGif?.previewUrl,
      mediaAlt: commentGif?.title,
      createdAt: null,
    };
    setComments(prev => [...prev, optimisticComment]);
    setInput("");
    
    try {
      const commentId = await postService.addComment(postId, user.uid, {
        name: userData?.name || user.displayName || "Anonymous",
        photoURL: user.photoURL || undefined,
        tier: userData?.tier || 'explorer',
      }, optimisticComment.content, null, (commentGif || commentSticker) ? { type: (commentGif || commentSticker)!.mediaType, url: (commentGif || commentSticker)!.url, previewUrl: (commentGif || commentSticker)!.previewUrl, alt: (commentGif || commentSticker)!.title } : undefined);

      await awardXPAction('community_comment_created', {
        resourceId: commentId,
        metadata: { postId },
      });
      setCommentGif(null);
      setCommentSticker(null);
    } catch (err) {
      logger.warn('[CommentThread] Failed to add comment', { error: err instanceof Error ? err.message : String(err), postId });
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
        <form onSubmit={handleSubmit} className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-xl border border-white/10 shrink-0 overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User Avatar"} title={user.displayName || "User Avatar"} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary/10" />
            )}
          </div>
          <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 pr-2 transition-colors focus-within:border-primary/40">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-xs text-white py-2.5 placeholder:text-muted-foreground/50 outline-none"
            />
            {commentGif ? <SelectedGifPreview gif={commentGif} onRemove={() => setCommentGif(null)} /> : null}
            {commentSticker ? <SelectedGifPreview gif={commentSticker} onRemove={() => setCommentSticker(null)} /> : null}
            <div className="flex items-center justify-between gap-2">
              <ComposerTools
                onEmoji={(emoji) => setInput((value) => `${value}${emoji}`)}
                onSelectGif={setCommentGif}
                onToggleGif={() => setCommentGifOpen((value) => !value)}
                gifOpen={commentGifOpen}
                onSelectSticker={setCommentSticker}
                onToggleSticker={() => setCommentStickerOpen((value) => !value)}
                stickerOpen={commentStickerOpen}
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={(!input.trim() && !commentGif && !commentSticker) || submitting}
                title="Send comment"
                aria-label="Send comment"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-30"
              >
                <Send className="h-3 w-3 text-white" />
              </button>
            </div>
          </div>
        </form>
      )}
    </motion.div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Image as ImageIcon, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Post, PostType, postService } from "@/lib/db";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { POST_CHANNELS, getChannelLabel, PostChannel } from "@/lib/communityChannels";
import { normalizeDate } from "@/lib/date-utils";
import { showErrorToast } from "@/lib/error-toast";
import { logger } from "@/lib/logger";

const POST_TYPES: { type: PostType; label: string; icon: string }[] = [
  { type: "insight", label: "Insight", icon: "💡" },
  { type: "win", label: "Win", icon: "🏆" },
  { type: "question", label: "Question", icon: "❓" },
  { type: "mentorship", label: "Mentorship", icon: "🤝" },
];

// Time limit for editing posts (30 minutes in milliseconds)
const EDIT_TIME_LIMIT = 30 * 60 * 1000;

interface EditPostModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedPost: Post) => void;
}

function canEditPost(post: Post, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const createdAt = normalizeDate(post.createdAt);
  if (!createdAt) return false;
  return Date.now() - createdAt.getTime() <= EDIT_TIME_LIMIT;
}

export function EditPostModal({ post, isOpen, onClose, onUpdate }: EditPostModalProps) {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState(post.content);
  const [tags, setTags] = useState<string[]>(post.tags || []);
  const [type, setType] = useState<PostType>(post.type);
  const [channel, setChannel] = useState<PostChannel>(post.channel as PostChannel || "general");
  const [linkUrl, setLinkUrl] = useState(post.linkUrl || "");
  const [showLinkInput, setShowLinkInput] = useState(!!post.linkUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = userData?.isAdmin || userData?.role === 'admin';
  
  // Check if editing is still allowed
  useEffect(() => {
    if (isOpen && !canEditPost(post, isAdmin)) {
      toast({
        title: "Edit time expired",
        description: "You can only edit posts within 30 minutes of creation.",
        variant: "destructive",
      });
      onClose();
    }
  }, [isOpen, post, isAdmin, onClose, toast]);

  // Reset form when post changes
  useEffect(() => {
    if (isOpen) {
      setContent(post.content);
      setTags(post.tags || []);
      setType(post.type);
      setChannel(post.channel as PostChannel || "general");
      setLinkUrl(post.linkUrl || "");
      setShowLinkInput(!!post.linkUrl);
    }
  }, [post, isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!content.trim() && !post.imageUrl && !linkUrl.trim()) {
      toast({
        title: "Error",
        description: "Post content is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updates = {
        content: content.trim(),
        tags,
        type,
        channel,
        linkUrl: linkUrl.trim() || undefined,
        editedAt: new Date(),
        isEdited: true,
      };

      await postService.updatePost(post.id, updates);
      
      toast({
        title: "Post updated",
        description: "Your changes have been saved.",
      });
      
      onUpdate({ ...post, ...updates });
      onClose();
    } catch (error) {
      logger.warn('Failed to update post', { error: error instanceof Error ? error.message : String(error), postId: post.id });
      showErrorToast(toast, error, { title: "Update failed", fallback: "Failed to update post. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const tagInput = POST_CHANNELS.find(ch => ch.id === channel)?.label || "";

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard className="p-6 rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Post</h2>
                <p className="text-[10px] text-muted-foreground">
                  You can edit for 30 minutes after posting
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-4 text-white placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50 min-h-[120px]"
                rows={4}
              />

              {/* Type selector */}
              <div className="flex gap-2 flex-wrap">
                {POST_TYPES.map((pt) => (
                  <button
                    key={pt.type}
                    onClick={() => setType(pt.type)}
                    className={cn(
                      "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all",
                      type === pt.type
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                    )}
                  >
                    <span>{pt.icon}</span> {pt.label}
                  </button>
                ))}
              </div>

              {/* Channel selector */}
              <div className="flex gap-2 flex-wrap">
                {POST_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setChannel(ch.id)}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all",
                      channel === ch.id
                        ? "bg-accent/20 border-accent/50 text-accent"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                    )}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>

              {/* Link input */}
              {showLinkInput && (
                <div className="flex items-center gap-2">
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onBlur={() => {
                      // SECURITY: Validate URL on blur
                      if (linkUrl.trim()) {
                        try {
                          let urlToValidate = linkUrl.trim();
                          if (!urlToValidate.match(/^https?:\/\//i)) {
                            urlToValidate = 'https://' + urlToValidate;
                          }
                          const url = new URL(urlToValidate);
                          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                            setLinkUrl('');
                          }
                        } catch {
                          console.warn('Invalid URL format in edit:', linkUrl);
                        }
                      }
                    }}
                    placeholder="https://example.com"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-primary/40"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-red-400"
                    onClick={() => {
                      setLinkUrl("");
                      setShowLinkInput(false);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Image preview (if exists) */}
              {post.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <img src={post.imageUrl} alt="Post image" className="w-full h-32 object-cover" />
                  <p className="text-[10px] text-muted-foreground p-2">Image cannot be changed</p>
                </div>
              )}

              {/* Character count */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 text-[10px]",
                      showLinkInput && "bg-white/5"
                    )}
                    onClick={() => setShowLinkInput(!showLinkInput)}
                  >
                    <LinkIcon className="w-3 h-3 mr-1" />
                    Link
                  </Button>
                </div>
                <span className={cn("text-[10px] font-mono", content.length > 450 ? "text-red-400" : "text-muted-foreground/40")}>
                  {content.length}/500
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isSubmitting || content.length > 500}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Save Changes
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

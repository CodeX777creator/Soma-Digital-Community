"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon, Link as LinkIcon, Send, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { PostType, dbService } from "@/lib/db";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useUserStore } from "@/store/useUserStore";
import { authFetch } from "@/lib/clientApi";
import { awardXP } from "@/lib/xp";
import { CommunityChannel, DEFAULT_POST_CHANNEL, getChannelLabel, POST_CHANNELS, PostChannel } from "@/lib/communityChannels";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

const TAG_SUGGESTIONS = ["AI", "SaaS", "Funnel", "Growth", "Win", "Design", "Web3", "Mindset", "Jobs", "Showcase"];

const POST_TYPES: { type: PostType; label: string; icon: string }[] = [
  { type: "insight",    label: "Insight",   icon: "💡" },
  { type: "win",        label: "Win",        icon: "🏆" },
  { type: "question",  label: "Question",   icon: "❓" },
  { type: "mentorship",label: "Mentorship", icon: "🤝" },
];

type CreatePostBoxProps = {
  selectedChannel?: CommunityChannel;
};

export function CreatePostBox({ selectedChannel = "all" }: CreatePostBoxProps) {
  const { user, userData } = useAuth();
  const { incrementEngagementScore, engagementScore } = useUserStore();
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [channel, setChannel] = useState<PostChannel>(DEFAULT_POST_CHANNEL);
  const [postType, setPostType] = useState<PostType>("insight");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string>("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedPostChannel = selectedChannel === "all" ? DEFAULT_POST_CHANNEL : selectedChannel;

  useEffect(() => {
    if (!expanded) {
      setChannel(selectedPostChannel);
    }
  }, [expanded, selectedPostChannel]);

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const uploadImage = async (file: File) => {
    setImageError(null);
    setImageUploading(true);
    try {
      if (!user) throw new Error('User must be signed in to upload an image');
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are allowed');
      }
      const imageRef = ref(storage, `community-posts/${user.uid}/${Date.now()}-${file.name}`);
      const snapshot = await uploadBytes(imageRef, file, { contentType: file.type });
      const url = await getDownloadURL(snapshot.ref);
      setImageUrl(url);
    } catch (err: any) {
      console.error('Image upload failed', err);
      setImageError(err?.message || 'Upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadImage(file);
    event.target.value = "";
  };

  const handlePost = async () => {
    if (!user || !userData || (!content.trim() && !imageUrl && !linkUrl.trim())) return;
    setSubmitting(true);
    setPostError(null);

    try {
      const channelTag = getChannelLabel(channel);
      const finalTags = Array.from(new Set([...tags, channelTag]));
      const payload: any = {
        content: content.trim(),
        channel,
        tags: finalTags,
        type: postType,
      };

      if (imageUrl) payload.imageUrl = imageUrl;
      if (linkUrl.trim()) payload.linkUrl = linkUrl.trim();

      const response = await authFetch('/api/community/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || body?.message || 'Unable to post';
        throw new Error(message);
      }

      incrementEngagementScore(15);
      dbService.saveUserProfile(user.uid, { engagementScore: (engagementScore || 0) + 15 });
      await awardXP(user.uid, 15, 'post', { postType, tagCount: tags.length });

      setContent("");
      setTags([]);
      setChannel(DEFAULT_POST_CHANNEL);
      setPostType("insight");
      setImageUrl(null);
      setLinkUrl("");
      setShowLinkInput(false);
      setExpanded(false);
    } catch (err: any) {
      console.error("Failed to create post:", err);
      setPostError(err?.message || 'Unable to create post');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <GlassCard className="p-4 border-t-2 border-t-primary/30 rounded-3xl">
      <div className="flex gap-4">
        <UserAvatar 
          src={user.photoURL} 
          name={userData?.name || user.displayName} 
          size="md"
          className="border-2 border-primary/30 p-0.5" 
        />

        <div className="flex-1 flex flex-col gap-3">
          {/* Textarea */}
          <textarea
            ref={textRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Share a win, insight, or ask the community..."
            className="w-full bg-transparent border-none resize-none focus:ring-0 text-base placeholder:text-muted-foreground/60 pt-1 no-scrollbar outline-none leading-relaxed"
            rows={expanded ? 3 : 2}
          />

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                {/* Channel selector */}
                <div className="flex gap-2 flex-wrap">
                  {POST_CHANNELS.map(ch => (
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

                {/* Post type selector */}
                <div className="flex gap-2 flex-wrap">
                  {POST_TYPES.map(pt => (
                    <button
                      key={pt.type}
                      onClick={() => setPostType(pt.type)}
                      className={cn(
                        "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all",
                        postType === pt.type
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-white"
                      )}
                    >
                      <span>{pt.icon}</span> {pt.label}
                    </button>
                  ))}
                </div>

                {/* Tag suggestions */}
                <div className="flex gap-2 flex-wrap">
                  {TAG_SUGGESTIONS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all",
                        tags.includes(tag)
                          ? "bg-primary/20 border-primary/40 text-primary"
                          : "border-white/5 text-muted-foreground hover:border-white/15 bg-white/[0.02]"
                      )}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>

                {/* Character count */}
                <div className="flex items-center justify-end">
                  <span className={cn("text-[10px] font-mono", content.length > 450 ? "text-red-400" : "text-muted-foreground/40")}>
                    {content.length}/500
                  </span>
                </div>
                {showLinkInput && (
                  <div className="flex items-center gap-2">
                    <input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-primary/40"
                    />
                    {linkUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-400"
                        onClick={() => setLinkUrl("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
                {imageUrl && (
                  <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold">Image attached</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-red-400"
                        onClick={() => setImageUrl(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <img src={imageUrl} alt="Attached preview" className="mt-3 w-full rounded-2xl object-cover" />
                  </div>
                )}
                {imageError && (
                  <p className="text-xs text-red-400">{imageError}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom bar */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Upload community image"
            className="hidden"
            onChange={handleImageSelect}
          />
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-8 h-8 rounded-xl text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/5",
                  showLinkInput && "bg-white/5"
                )}
                onClick={() => setShowLinkInput((value) => !value)}
              >
                <LinkIcon className="w-4 h-4" />
              </Button>
              {expanded && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setExpanded(false);
                    setContent("");
                    setTags([]);
                    setChannel(DEFAULT_POST_CHANNEL);
                    setImageUrl(null);
                    setLinkUrl("");
                    setShowLinkInput(false);
                  }}
                  className="w-8 h-8 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-400/5"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <Button
              onClick={handlePost}
              disabled={(!content.trim() && !imageUrl && !linkUrl.trim()) || submitting || content.length > 500 || imageUploading}
              className="bg-primary hover:bg-primary/90 rounded-full h-9 px-5 font-bold text-xs blue-glow transition-all active:scale-95 disabled:opacity-40 gap-2"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Post
            </Button>
          </div>
          {postError && (
            <p className="text-sm text-red-400 mt-2">{postError}</p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Users, Trophy, Sparkles, MessageSquare, Zap,
  Star, ChevronRight, Cpu, Loader2, Briefcase,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PostCard } from "@/components/community/PostCard";
import { CreatePostBox } from "@/components/community/CreatePostBox";
import { Post, postService } from "@/lib/db";
import { COMMUNITY_CHANNELS, CommunityChannel } from "@/lib/communityChannels";

// ─── Static AI Intel Sections ─────────────────────────────────────────────────


const CHANNEL_NAV = [
  { ...COMMUNITY_CHANNELS[0], icon: <Users className="w-4 h-4 text-primary" /> },
  { ...COMMUNITY_CHANNELS[1], icon: <MessageSquare className="w-4 h-4 text-primary" /> },
  { ...COMMUNITY_CHANNELS[2], icon: <Trophy className="w-4 h-4 text-yellow-500" /> },
  { ...COMMUNITY_CHANNELS[3], icon: <Sparkles className="w-4 h-4 text-accent" /> },
  { ...COMMUNITY_CHANNELS[4], icon: <Briefcase className="w-4 h-4 text-emerald-400" /> },
  { ...COMMUNITY_CHANNELS[5], icon: <Cpu className="w-4 h-4 text-purple-400" /> },
];

const CHANNEL_MATCHERS: Record<Exclude<CommunityChannel, "all">, string[]> = {
  general: ["general"],
  showcase: ["showcase", "win"],
  questions: ["questions", "question"],
  jobs: ["jobs", "job"],
  "ai-mentor": ["ai-mentor", "ai mentor", "mentorship"],
};

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function postTimestamp(post: Post) {
  if (post.createdAt?.toDate) return post.createdAt.toDate().getTime();
  if (post.createdAt?.seconds) return post.createdAt.seconds * 1000;
  return 0;
}

function matchesChannel(post: Post, channel: CommunityChannel) {
  if (channel === "all") return true;
  const matchers = CHANNEL_MATCHERS[channel];
  const values = [
    post.channel,
    post.type,
    ...(post.tags || []),
  ].filter((value): value is string => typeof value === "string").map(normalizeValue);

  if (channel === "general" && !post.channel) return true;
  return values.some((value) => matchers.includes(value));
}


// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyFeed({ message = "Be the first entrepreneur to spark this discussion. Share a win, insight, or question." }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 gap-6 text-center"
    >
      <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Sparkles className="w-9 h-9 text-primary/60" />
      </div>
      <div className="space-y-2 max-w-xs">
        <h3 className="font-bold text-lg text-white/80">The stage is set.</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {message}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<CommunityChannel>("all");

  useEffect(() => {
    const unsub = postService.subscribeToPosts((fetched) => {
      setPosts(fetched);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Derived: win posts from today
  const founderWins = posts.filter(p => p.type === "win").slice(0, 5);
  const tagCounts = posts.reduce<Record<string, number>>((acc, post) => {
    post.tags?.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});
  const trendingTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sortedPosts = [...posts].sort((a, b) => postTimestamp(b) - postTimestamp(a));
  const filteredPosts = sortedPosts.filter((post) => matchesChannel(post, activeChannel));
  const channelCounts = CHANNEL_NAV.reduce<Record<CommunityChannel, number>>((acc, channel) => {
    acc[channel.id] = channel.id === "all"
      ? posts.length
      : posts.filter((post) => matchesChannel(post, channel.id)).length;
    return acc;
  }, {} as Record<CommunityChannel, number>);
  const spotlight = posts.find(post => !!post.authorName);
  const communityProgress = Math.min(100, Math.round((posts.length / 100) * 100));

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-700">

          {/* ── Left Sidebar ──────────────────────────────────────────────── */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 sticky top-24 h-fit">

            {/* Channel nav */}
            <GlassCard className="p-4 flex flex-col gap-1">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] px-2 mb-3">
                Ecosystem Channels
              </h4>
              {CHANNEL_NAV.map(ch => (
                <Button
                  key={ch.id}
                  variant="ghost"
                  onClick={() => setActiveChannel(ch.id)}
                  className={cn(
                    "justify-start gap-3 h-11 rounded-xl transition-all w-full",
                    activeChannel === ch.id
                      ? "bg-white/5 border border-white/5 text-white"
                      : "hover:bg-white/5 text-muted-foreground hover:text-white"
                  )}
                >
                  {ch.icon}
                  <span className="flex-1 text-left">{ch.label}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{channelCounts[ch.id] || 0}</span>
                </Button>
              ))}
            </GlassCard>

            {/* Trending tags */}
            <GlassCard className="p-5 flex flex-col gap-4">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Market Trends</h4>
              <div className="flex flex-wrap gap-2">
                {trendingTags.length > 0 ? trendingTags.map(([tag, count]) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all py-1.5 px-3 border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                  >
                    #{tag} {count > 1 ? count : ""}
                  </Badge>
                )) : (
                  <p className="text-xs text-muted-foreground">Trends will appear as members tag their posts.</p>
                )}
              </div>
            </GlassCard>

            {/* Elite groups CTA */}
            <GlassCard className="p-0 overflow-hidden relative group cursor-pointer border-primary/20 bg-gradient-to-br from-primary/10 to-transparent hover:border-primary/40 transition-all">
              <div className="p-6">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center blue-glow mb-4">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-bold text-sm mb-1">Elite Groups</h4>
                <p className="text-[10px] text-muted-foreground">Unlock private member circles with 6-7 figure founders.</p>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-4 h-4 text-primary" />
              </div>
            </GlassCard>
          </div>

          {/* ── Main Feed ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-6 flex flex-col gap-6">

            {/* TODAY'S MOMENTUM — AI intel bar */}
            <div className="rounded-[2rem] bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 p-[1px] animate-pulse-glow">
              <GlassCard className="rounded-[2rem] bg-card/90 border-none p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Today's Momentum</h3>
                    <p className="text-[10px] text-muted-foreground">AI-curated community pulse · updated live</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400 uppercase">Live</span>
                  </div>
                </div>
                <p className="text-sm text-white/80 leading-relaxed italic">
                  "{posts.length > 0
                    ? `${filteredPosts.length} post${filteredPosts.length === 1 ? "" : "s"} in ${CHANNEL_NAV.find(channel => channel.id === activeChannel)?.label || "All"} · ${founderWins.length} founder wins recorded · community momentum is rising.`
                    : "The community is warming up. Be the first to post and ignite the feed."}"
                </p>
              </GlassCard>
            </div>

            {/* FOUNDER WINS — horizontal scroll carousel */}
            {founderWins.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Founder Wins</h3>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                  {founderWins.map(post => (
                    <div
                      key={post.id}
                      className="shrink-0 w-56 rounded-2xl border border-yellow-400/15 bg-yellow-400/5 p-4 flex flex-col gap-2 hover:border-yellow-400/30 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl overflow-hidden border border-yellow-400/20 shrink-0">
                          <img src={post.authorAvatar} alt={post.authorName} title={post.authorName} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white truncate">{post.authorName}</p>
                          <p className="text-[9px] text-yellow-500/80 uppercase font-bold">🏆 Win</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-white/75 leading-relaxed line-clamp-3">{post.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create Post */}
            <div className="lg:hidden flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {CHANNEL_NAV.map(ch => (
                <Button
                  key={ch.id}
                  variant="ghost"
                  onClick={() => setActiveChannel(ch.id)}
                  className={cn(
                    "shrink-0 gap-2 h-10 rounded-xl border transition-all",
                    activeChannel === ch.id
                      ? "bg-white/5 border-white/10 text-white"
                      : "border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white"
                  )}
                >
                  {ch.icon}
                  {ch.label}
                  <span className="text-[10px] font-bold text-muted-foreground">{channelCounts[ch.id] || 0}</span>
                </Button>
              ))}
            </div>

            <CreatePostBox selectedChannel={activeChannel} />

            {/* Feed */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Loading the community feed...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <EmptyFeed message={activeChannel === "all" ? undefined : "No posts in this channel yet. Be the first!"} />
            ) : (
              <div className="flex flex-col gap-5">
                <AnimatePresence initial={false}>
                  {filteredPosts.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── Right Sidebar ─────────────────────────────────────────────── */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-5 sticky top-24 h-fit">

            {/* Member Spotlight */}
            <GlassCard className="p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Member Spotlight</h4>
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
              </div>
              {spotlight ? (
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-20 h-20 rounded-3xl border-2 border-accent p-1 cyan-glow overflow-hidden bg-white/5 flex items-center justify-center">
                    {spotlight.authorAvatar ? (
                      <img src={spotlight.authorAvatar} alt={spotlight.authorName} title={spotlight.authorName} className="w-full h-full rounded-2xl object-cover" />
                    ) : (
                      <Users className="w-8 h-8 text-accent" />
                    )}
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">{spotlight.authorName}</h5>
                    <p className="text-[10px] text-accent font-bold uppercase tracking-widest mt-1">{spotlight.authorRole || "Member"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed px-2 line-clamp-3">{spotlight.content}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Member spotlight appears after the first community post.</p>
              )}
            </GlassCard>

            {/* Live community stats */}
            <GlassCard className="p-6">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-5">Community Stats</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                    <span className="text-muted-foreground">Community Goal</span>
                    <span className="text-primary">{communityProgress}%</span>
                  </div>
                  <Progress value={communityProgress} className="h-1.5 bg-white/5" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Posts</p>
                    <p className="text-lg font-bold">{loading ? "—" : posts.length}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Wins</p>
                    <p className="text-lg font-bold text-yellow-400">{loading ? "—" : founderWins.length}</p>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Popular Tags */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Popular Tags</h4>
              </div>
              <div className="flex flex-col gap-4">
                {trendingTags.length > 0 ? trendingTags.map(([tag, count]) => (
                  <div key={tag} className="group space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-medium text-white/80 group-hover:text-white transition-colors leading-snug">#{tag}</p>
                      <span className="text-[10px] font-bold text-primary shrink-0">{count}</span>
                    </div>
                    <Progress value={Math.min(100, count * 10)} className="h-0.5 bg-white/5" />
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground">No tag activity yet.</p>
                )}
              </div>
            </GlassCard>

          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

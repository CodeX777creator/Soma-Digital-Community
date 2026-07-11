"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users, Trophy, Sparkles, MessageSquare,
  Cpu, Loader2, Briefcase,
  CalendarDays, Hash, Heart, ImageIcon, BarChart3, Filter,
  UserPlus, Crown, Bell, Video,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PostCardOptimized } from "@/components/community/PostCardOptimized";
import { CreatePostBox } from "@/components/community/CreatePostBox";
import { EditPostModal } from "@/components/community/EditPostModal";
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
  const [editModalPost, setEditModalPost] = useState<Post | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [deletedPost, setDeletedPost] = useState<Post | null>(null);

    useEffect(() => {
    const unsub = postService.subscribeToPosts((fetched) => {
      setPosts(fetched);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Optimistic UI handlers
  const handleEditPost = (post: Post) => {
    setEditModalPost(post);
  };

  const handleDeletePost = async (postId: string, post?: Post) => {
        // If post object is provided (from undo trigger), restore it
        if (post && post.content && post.content !== '[deleted]') {
          try {
            // Restore the post in Firestore
            await postService.restorePost(postId, post.content);
            // Restore the deleted post in UI
            setPosts(prev => [post, ...prev]);
            setDeletedPost(null);
            setPendingDeleteId(null);
          } catch (error) {
            console.error('Failed to restore post:', error);
            // Show error toast
          }
          return;
        }
    
    
      // Optimistic delete: remove immediately from UI
      const postToRemove = posts.find(p => p.id === postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setPendingDeleteId(postId);
    
      // Store deleted post for potential undo
      if (postToRemove) {
        setDeletedPost(postToRemove);
      }

      try {
        await postService.deletePost(postId);
        // Clear deleted post after successful deletion
        setPendingDeleteId(null);
        // Keep deletedPost for undo toast (cleared after 5 seconds or when undo is clicked)
      } catch (error) {
        console.error('Failed to delete post:', error);
        // Rollback on error
        setPendingDeleteId(null);
        setDeletedPost(null);
        // Optionally show error toast or re-fetch
      }
    };

    // Cleanup deleted post state after 5 seconds (undo timeout)
    useEffect(() => {
      if (deletedPost) {
        const timer = setTimeout(() => {
          setDeletedPost(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [deletedPost]);


  const handleUpdatePost = async (updatedPost: Post) => {
    // Optimistic update: update immediately in UI
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    setEditModalPost(null);
  };

  // Derived: win posts from today
  const founderWins = posts.filter(p => p.type === "win" && !p.deleted).slice(0, 5);
  const tagCounts = posts.reduce<Record<string, number>>((acc, post) => {
    if (post.deleted) return acc;
    post.tags?.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});
  const trendingTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sortedPosts = [...posts].filter(p => !p.deleted).sort((a, b) => postTimestamp(b) - postTimestamp(a));
  const filteredPosts = sortedPosts.filter((post) => matchesChannel(post, activeChannel));
  const activePosts = posts.filter(p => !p.deleted);
  const channelCounts = CHANNEL_NAV.reduce<Record<CommunityChannel, number>>((acc, channel) => {
    acc[channel.id] = channel.id === "all"
      ? activePosts.length
      : activePosts.filter((post) => matchesChannel(post, channel.id)).length;
    return acc;
  }, {} as Record<CommunityChannel, number>);
  const spotlight = posts.find(post => !!post.authorName);
  const topContributors = Object.values(
    activePosts.reduce<Record<string, { name: string; avatar?: string; role?: string; points: number }>>((acc, post) => {
      const key = post.authorId || post.authorName || post.id;
      const existing = acc[key] || {
        name: post.authorName || "Community member",
        avatar: post.authorAvatar,
        role: post.authorRole,
        points: 0,
      };
      existing.points += 120 + (post.likeCount || 0) * 5 + (post.commentCount || 0) * 8;
      acc[key] = existing;
      return acc;
    }, {})
  ).sort((a, b) => b.points - a.points).slice(0, 5);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_1fr_320px] animate-in fade-in duration-700">
          <aside className="hidden xl:flex flex-col gap-5 sticky top-24 h-fit">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-4 shadow-xl shadow-black/20 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Your Communities</h2>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-[#8B5CF6]">View all</Button>
              </div>
              <div className="space-y-3">
                {CHANNEL_NAV.slice(1).map((channel, index) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => setActiveChannel(channel.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] border p-2.5 text-left transition",
                      activeChannel === channel.id ? "border-[#5B5FFF]/60 bg-[#5B5FFF]/10" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.03]"
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[#090B13]/70">
                      {channel.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{channel.label}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-[#22C55E]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                        Active now
                      </span>
                    </span>
                    <span className="rounded-full bg-[#6D28D9] px-2 py-0.5 text-xs font-semibold text-white">
                      {channelCounts[channel.id] || (index + 2) * 6}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <h2 className="text-sm font-semibold text-white">Trending Topics</h2>
              <div className="mt-5 space-y-4">
                {(trendingTags.length > 0 ? trendingTags.slice(0, 5) : [["AIForBusiness", 12], ["DigitalMarketing", 8], ["PassiveIncome", 6], ["ContentCreation", 5], ["Entrepreneurship", 4]] as [string, number][]).map(([tag, count]) => (
                  <div key={tag} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-3 text-[#BFC6D4]">
                      <Hash className="h-4 w-4 flex-none text-[#5B5FFF]" />
                      <span className="truncate">{tag}</span>
                    </span>
                    <span className="text-xs text-[#7E8799]">{count} posts</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Upcoming Events</h2>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-[#8B5CF6]">View all</Button>
              </div>
              {[
                ["MAY", "24", "Live Coaching Call", "7:00 PM EAT"],
                ["MAY", "27", "Content That Converts", "8:00 PM EAT"],
              ].map(([month, day, title, time]) => (
                <div key={title} className="mb-3 flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-[#090B13]/60 p-3">
                  <div className="w-12 rounded-xl border border-white/[0.08] bg-white/[0.04] text-center">
                    <div className="rounded-t-xl bg-[#7F1D46] py-1 text-[10px] font-bold text-white">{month}</div>
                    <div className="py-1 text-xl font-semibold text-white">{day}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-[#BFC6D4]">{time}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.04]">Join</Button>
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-6 shadow-2xl shadow-black/25 backdrop-blur md:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(139,92,246,.42),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(79,157,255,.24),transparent_34%)]" />
              <div className="relative grid gap-6 md:grid-cols-[1fr_260px] md:items-center">
                <div>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-lg shadow-[#5B5FFF]/25">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Social Hub</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#BFC6D4]">
                    Connect, learn, share, and grow with entrepreneurs building digital businesses inside SDC.
                  </p>
                </div>
                <div className="hidden h-36 items-end justify-center md:flex">
                  <div className="relative flex h-28 w-56 items-end justify-center">
                    {[0, 1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="absolute flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.12] bg-[#090B13] shadow-xl shadow-black/30"
                        style={{ left: `${item * 44}px`, bottom: `${item % 2 === 0 ? 10 : 34}px` }}
                      >
                        <Users className="h-7 w-7 text-[#4F9DFF]" />
                      </div>
                    ))}
                    <div className="absolute right-4 top-0 rounded-2xl bg-[#EF476F] px-3 py-2 text-white shadow-lg">
                      <Heart className="h-4 w-4 fill-white" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-4 shadow-xl shadow-black/20 backdrop-blur">
              <CreatePostBox selectedChannel={activeChannel} />
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  ["Photo/Video", ImageIcon],
                  ["Poll", BarChart3],
                  ["Live Video", Video],
                  ["Event", CalendarDays],
                ].map(([label, Icon]) => {
                  const ActionIcon = Icon as typeof ImageIcon;
                  return (
                    <button key={label as string} type="button" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#090B13]/55 text-sm text-[#BFC6D4] transition hover:border-[#5B5FFF]/50 hover:text-white">
                      <ActionIcon className="h-4 w-4 text-[#4F9DFF]" />
                      {label as string}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {CHANNEL_NAV.map((channel) => (
                <Button
                  key={channel.id}
                  variant="ghost"
                  onClick={() => setActiveChannel(channel.id)}
                  className={cn(
                    "h-10 shrink-0 gap-2 rounded-xl border px-4 transition-all",
                    activeChannel === channel.id
                      ? "border-[#5B5FFF]/60 bg-[#6D28D9] text-white"
                      : "border-white/[0.08] bg-[#151A2E]/60 text-[#BFC6D4] hover:bg-white/[0.05] hover:text-white"
                  )}
                >
                  {channel.label}
                  <span className="text-[10px]">{channelCounts[channel.id] || 0}</span>
                </Button>
              ))}
              <Button variant="ghost" className="ml-auto hidden h-10 shrink-0 gap-2 rounded-xl border border-white/[0.08] bg-[#151A2E]/60 text-[#BFC6D4] md:flex">
                <Filter className="h-4 w-4" />
              </Button>
            </div>

            {founderWins.length > 0 && (
              <section className="flex gap-4 overflow-x-auto pb-1">
                {founderWins.map(post => (
                  <div key={post.id} className="w-64 shrink-0 rounded-[18px] border border-yellow-400/20 bg-yellow-400/5 p-4">
                    <div className="flex items-center gap-3">
                      <img src={post.authorAvatar} alt={post.authorName} className="h-10 w-10 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{post.authorName}</p>
                        <p className="text-xs text-yellow-400">Founder win</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#BFC6D4]">{post.content}</p>
                  </div>
                ))}
              </section>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 py-16 text-[#BFC6D4]">
                <Loader2 className="h-8 w-8 animate-spin text-[#4F9DFF]" />
                <p className="text-sm">Loading the community feed...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <EmptyFeed message={activeChannel === "all" ? undefined : "No posts in this channel yet. Be the first!"} />
            ) : (
              <div className="flex flex-col gap-5">
                <AnimatePresence initial={false}>
                  {filteredPosts.map(post => (
                    <PostCardOptimized
                      key={post.id}
                      post={post}
                      onEdit={handleEditPost}
                      onDelete={handleDeletePost}
                      isPendingDelete={pendingDeleteId === post.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {editModalPost && (
              <EditPostModal
                post={editModalPost}
                isOpen={true}
                onClose={() => setEditModalPost(null)}
                onUpdate={handleUpdatePost}
              />
            )}
          </main>

          <aside className="hidden xl:flex flex-col gap-5 sticky top-24 h-fit">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">People to Follow</h2>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-[#8B5CF6]">View all</Button>
              </div>
              {(topContributors.length > 0 ? topContributors : [
                { name: "Michele O'Neil", role: "Business Mentor", points: 0 },
                { name: "Derrick J.", role: "Digital Marketer", points: 0 },
                { name: "Linda K.", role: "Content Strategist", points: 0 },
              ]).slice(0, 4).map((person) => (
                <div key={person.name} className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-[#090B13]">
                    {person.avatar ? <img src={person.avatar} alt={person.name} className="h-full w-full object-cover" /> : <UserPlus className="h-5 w-5 text-[#4F9DFF]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{person.name}</p>
                    <p className="truncate text-xs text-[#7E8799]">{person.role || "Community member"}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.04] text-[#BFC6D4]">Follow</Button>
                </div>
              ))}
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Top Contributors</h2>
                <span className="text-xs text-[#8B5CF6]">This Week</span>
              </div>
              <div className="space-y-3">
                {(topContributors.length > 0 ? topContributors : [{ name: "Sarah M.", points: 1250 }, { name: "David O.", points: 980 }, { name: "Linda K.", points: 760 }]).map((person, index) => (
                  <div key={person.name} className="flex items-center gap-3">
                    <div className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", index === 0 ? "bg-yellow-400 text-black" : "bg-white/[0.08] text-[#BFC6D4]")}>
                      {index + 1}
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#090B13]">
                      {person.avatar ? <img src={person.avatar} alt={person.name} className="h-full w-full object-cover" /> : <Crown className="h-4 w-4 text-[#F59E0B]" />}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm text-white">{person.name}</p>
                    <p className="text-xs text-[#7E8799]">{person.points.toLocaleString()} pts</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#4F9DFF]" />
                <h2 className="text-sm font-semibold text-white">Community Highlights</h2>
              </div>
              {spotlight ? (
                <div className="mt-4 rounded-[16px] border border-white/[0.08] bg-[#090B13]/60 p-4">
                  <p className="text-sm font-medium text-white">{spotlight.authorName}</p>
                  <p className="mt-2 line-clamp-4 text-sm leading-6 text-[#BFC6D4]">{spotlight.content}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#BFC6D4]">Highlights appear after the first community post.</p>
              )}
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-gradient-to-br from-[#151A2E] to-[#1A2140] p-5 shadow-xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Create a Community</h2>
                  <p className="mt-1 text-xs text-[#BFC6D4]">Build your own circle around your expertise.</p>
                </div>
              </div>
              <Button className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] text-white">
                Create Community
              </Button>
            </div>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

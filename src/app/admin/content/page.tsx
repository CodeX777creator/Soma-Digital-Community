"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle,
  Filter,
  Loader2,
  MessageSquare,
  Pin,
  PinOff,
  Search,
  ThumbsUp,
  Trash2,
  Type,
  User,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { Firestore } from "firebase/firestore";
import { Post } from "@/lib/db";

type ModeratedPost = Post & {
  moderationStatus?: "pending" | "approved" | "flagged";
  moderatedAt?: any;
  moderatedBy?: string;
};

type FilterStatus = "all" | "pinned" | "flagged" | "announcement" | "win";
type SortOption = "newest" | "oldest" | "engagement" | "likes";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncateContent(content: string, maxLength: number = 120) {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + "...";
}

function getPostTypeColor(type: string): string {
  const colors: Record<string, string> = {
    win: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    announcement: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    insight: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    question: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    mentorship: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  };
  return colors[type] || "text-white/60 bg-white/5 border-white/10";
}

function getPostTypeIcon(type: string) {
  switch (type) {
    case "win": return "🏆";
    case "announcement": return "📢";
    case "insight": return "💡";
    case "question": return "❓";
    case "mentorship": return "🤝";
    default: return "📝";
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Type;
  color: "cyan" | "amber" | "red" | "purple" | "emerald";
}) {
  const colorClasses = {
    cyan: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    amber: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    red: "text-red-400 bg-red-400/10 border-red-400/20",
    purple: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg border p-2 ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-medium text-white/50">{label}</p>
          <p className="text-xl font-semibold">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminContentPage() {
  const [posts, setPosts] = useState<ModeratedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const postsQuery = query(collection(db as Firestore, "posts"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        const fetchedPosts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ModeratedPost[];
        setPosts(fetchedPosts);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error fetching posts:", err);
        setError("Failed to load posts. Please try again.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredPosts = useMemo(() => {
    let result = [...posts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (post) =>
          post.content.toLowerCase().includes(q) ||
          post.authorName.toLowerCase().includes(q) ||
          post.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    switch (filterStatus) {
      case "pinned": result = result.filter((p) => p.isPinned); break;
      case "flagged": result = result.filter((p) => p.moderationStatus === "flagged"); break;
      case "announcement": result = result.filter((p) => p.type === "announcement"); break;
      case "win": result = result.filter((p) => p.type === "win"); break;
    }
    result.sort((a, b) => {
      switch (sortOption) {
        case "newest": return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
        case "oldest": return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
        case "engagement": return ((b.commentCount || 0) + (b.likeCount || 0)) - ((a.commentCount || 0) + (a.likeCount || 0));
        case "likes": return (b.likeCount || 0) - (a.likeCount || 0);
        default: return 0;
      }
    });
    return result;
  }, [posts, searchQuery, filterStatus, sortOption]);

  const stats = useMemo(() => ({
    total: posts.length,
    pinned: posts.filter((p) => p.isPinned).length,
    flagged: posts.filter((p) => p.moderationStatus === "flagged").length,
    announcements: posts.filter((p) => p.type === "announcement").length,
    wins: posts.filter((p) => p.type === "win").length,
  }), [posts]);

  const handleTogglePin = async (postId: string, currentPinned: boolean) => {
    setProcessingId(postId);
    try {
      await updateDoc(doc(db as Firestore, "posts", postId), { isPinned: !currentPinned });
    } catch (err) {
      console.error("Error toggling pin:", err);
      setError("Failed to update pin status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setProcessingId(postId);
    try {
      await deleteDoc(doc(db as Firestore, "posts", postId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting post:", err);
      setError("Failed to delete post.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleFlagPost = async (postId: string, flag: boolean) => {
    setProcessingId(postId);
    try {
            await updateDoc(doc(db as Firestore, "posts", postId), {
        moderationStatus: flag ? "flagged" : "approved",
        moderatedAt: new Date(),
      });
    } catch (err) {
      console.error("Error flagging post:", err);
      setError("Failed to update moderation status.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Posts" value={stats.total} icon={Type} color="cyan" />
        <StatCard label="Pinned" value={stats.pinned} icon={Pin} color="amber" />
        <StatCard label="Flagged" value={stats.flagged} icon={AlertTriangle} color="red" />
        <StatCard label="Announcements" value={stats.announcements} icon={MessageSquare} color="purple" />
        <StatCard label="Founder Wins" value={stats.wins} icon={ThumbsUp} color="emerald" />
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline hover:text-red-200">Dismiss</button>
        </div>
      )}

      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              placeholder="Search posts, authors, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              aria-label="Filter posts by status"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="all">All Posts</option>
              <option value="pinned">📌 Pinned</option>
              <option value="flagged">🚩 Flagged</option>
              <option value="announcement">📢 Announcements</option>
              <option value="win">🏆 Wins</option>
            </select>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              aria-label="Sort posts by"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="engagement">Most Engaged</option>
              <option value="likes">Most Liked</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          <Filter className="h-3.5 w-3.5" />
          Showing {filteredPosts.length} of {posts.length} posts
          {searchQuery && <span> matching &quot;{searchQuery}&quot;</span>}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.035]">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-white/55">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Loading content...
            </div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full border border-white/10 bg-white/[0.03] p-4">
              <MessageSquare className="h-8 w-8 text-white/30" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/70">No posts found</p>
              <p className="text-xs text-white/45 mt-1">
                {searchQuery || filterStatus !== "all" ? "Try adjusting your filters" : "Posts will appear here once created"}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className={`p-4 transition-colors hover:bg-white/[0.02] ${post.isPinned ? "bg-cyan-400/5" : ""} ${post.moderationStatus === "flagged" ? "bg-red-500/5" : ""}`}
              >
                <div className="flex gap-4">
                  <div className="shrink-0">
                    {post.authorAvatar ? (
                      <img src={post.authorAvatar} alt={post.authorName} className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                        <User className="h-5 w-5 text-white/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white/90">{post.authorName}</span>
                      <span className="text-white/40">·</span>
                      <span className="text-xs text-white/50">{formatDate(toDate(post.createdAt) || new Date())}</span>
                      {post.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-400/20"><Pin className="h-3 w-3" />Pinned</span>}
                      {post.moderationStatus === "flagged" && <span className="inline-flex items-center gap-1 rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] font-medium text-red-300 border border-red-400/20"><AlertTriangle className="h-3 w-3" />Flagged</span>}
                    </div>
                    <p className="mt-2 text-sm text-white/80 leading-relaxed">{truncateContent(post.content)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPostTypeColor(post.type || "")}`}>
                        {getPostTypeIcon(post.type || "")}
                        {post.type || "Post"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


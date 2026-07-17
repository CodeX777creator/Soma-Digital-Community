"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  collection,
  Firestore,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  AlertTriangle,
  Edit2,
  Filter,
  Loader2,
  MessageSquare,
  Megaphone,
  Pin,
  PinOff,
  Search,
  ThumbsUp,
  Trash2,
  Type,
  User,
  X,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { AdminErrorState, AdminEmptyState, AdminLoadingState } from "@/components/admin/AdminState";
import { Post } from "@/lib/db";

type ModeratedPost = Post & {
  moderationStatus?: "pending" | "approved" | "flagged";
  moderatedAt?: any;
  moderatedBy?: string;
  editedByAdmin?: boolean;
};

type FilterStatus = "all" | "pinned" | "flagged" | "announcement" | "win";
type SortOption = "newest" | "oldest" | "engagement" | "likes";

async function adminContentFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Content action failed.");
  return payload;
}

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

  // Create announcement
  const [announcementText, setAnnouncementText] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [announcementSuccess, setAnnouncementSuccess] = useState(false);

  // Edit post
  const [editingPost, setEditingPost] = useState<ModeratedPost | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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
          String(post.content || "").toLowerCase().includes(q) ||
          String(post.authorName || "").toLowerCase().includes(q) ||
          (Array.isArray(post.tags) ? post.tags : []).some((tag) => String(tag || "").toLowerCase().includes(q))
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
      await adminContentFetch(`/api/admin/content/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "toggle_pin" }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pin status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setProcessingId(postId);
    try {
      await adminContentFetch(`/api/admin/content/${postId}`, { method: "DELETE" });
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleFlagPost = async (postId: string, flag: boolean) => {
    setProcessingId(postId);
    try {
      await adminContentFetch(`/api/admin/content/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "moderate", flagged: flag }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update moderation status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim() || !db) return;
    setPostingAnnouncement(true);
    setError(null);
    try {
      await adminContentFetch("/api/admin/content", {
        method: "POST",
        body: JSON.stringify({ action: "create_announcement", content: announcementText.trim() }),
      });
      setAnnouncementText("");
      setAnnouncementSuccess(true);
      setTimeout(() => setAnnouncementSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const openEdit = (post: ModeratedPost) => {
    setEditingPost(post);
    setEditContent(post.content);
  };

  const handleSaveEdit = async () => {
    if (!editingPost || !editContent.trim() || !db) return;
    setSavingEdit(true);
    try {
      await adminContentFetch(`/api/admin/content/${editingPost.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "edit", content: editContent.trim() }),
      });
      setEditingPost(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post edit.");
    } finally {
      setSavingEdit(false);
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

      {/* Create Announcement */}
      <section className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-cyan-100">Broadcast Announcement</h3>
        </div>
        <form onSubmit={handleCreateAnnouncement} className="space-y-3">
          <textarea
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            placeholder="Write your announcement to the community..."
            rows={3}
            required
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 resize-none"
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={postingAnnouncement || !announcementText.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50">
              {postingAnnouncement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Post Announcement
            </button>
            {announcementSuccess && <span className="text-sm text-emerald-300">✓ Announcement posted!</span>}
            <span className="ml-auto text-xs text-white/35">{announcementText.length}/1000 chars</span>
          </div>
        </form>
      </section>

      {error && <AdminErrorState description={error} onRetry={() => setError(null)} retryLabel="Dismiss" />}

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
          <AdminLoadingState label="Loading content..." />
        ) : filteredPosts.length === 0 ? (
          <AdminEmptyState
            title="No posts found"
            description={searchQuery || filterStatus !== "all" ? "Try adjusting your filters." : "Posts will appear here once created."}
          />
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
                      {post.editedByAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-400/20">Admin edited</span>}
                    </div>
                    <p className="mt-2 text-sm text-white/80 leading-relaxed">{truncateContent(post.content)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPostTypeColor(post.type || "")}`}>
                        {getPostTypeIcon(post.type || "")}
                        {post.type || "Post"}
                      </span>
                      {/* Edit */}
                      <button type="button" onClick={() => openEdit(post)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50 hover:bg-white/10 hover:text-white/80">
                        <Edit2 className="h-2.5 w-2.5" /> Edit
                      </button>
                      {/* Pin / Unpin */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(post.id, !!post.isPinned)}
                        disabled={processingId === post.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${post.isPinned
                            ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20"
                            : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                          }`}
                      >
                        {processingId === post.id ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : post.isPinned ? (
                          <PinOff className="h-2.5 w-2.5" />
                        ) : (
                          <Pin className="h-2.5 w-2.5" />
                        )}
                        {post.isPinned ? "Unpin" : "Pin"}
                      </button>
                      {/* Flag / Unflag */}
                      <button
                        type="button"
                        onClick={() => handleFlagPost(post.id, post.moderationStatus !== "flagged")}
                        disabled={processingId === post.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${post.moderationStatus === "flagged"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                            : "border-white/10 bg-white/5 text-white/50 hover:bg-amber-400/10 hover:text-amber-300"
                          }`}
                      >
                        {post.moderationStatus === "flagged" ? "Unflag" : "Flag"}
                      </button>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(post.id)}
                        disabled={processingId === post.id}
                        className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-400/5 px-2 py-0.5 text-[10px] font-medium text-red-300/60 hover:bg-red-400/15 hover:text-red-200 disabled:opacity-50"
                      >
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[#080a0f] shadow-2xl">
            <div className="p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/25">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="font-semibold">Delete post?</h3>
              <p className="mt-1.5 text-sm text-white/50">This will permanently remove the post from the community feed. This action cannot be undone.</p>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setDeleteConfirm(null)}
                  className="h-9 rounded-md border border-white/10 px-4 text-sm text-white/60 hover:bg-white/10">Cancel</button>
                <button
                  type="button"
                  onClick={() => handleDeletePost(deleteConfirm)}
                  disabled={processingId === deleteConfirm}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {processingId === deleteConfirm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#080a0f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="font-semibold">Edit Post</h3>
                <p className="text-xs text-white/45">by {editingPost.authorName}</p>
              </div>
              <button type="button" onClick={() => setEditingPost(null)}
                aria-label="Close edit dialog"
                className="rounded-md p-2 text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                id="edit-post-content"
                aria-label="Edit post content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:outline-none resize-none"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditingPost(null)}
                  className="h-9 rounded-md border border-white/10 px-4 text-sm text-white/60 hover:bg-white/10">Cancel</button>
                <button type="button" onClick={handleSaveEdit} disabled={savingEdit || !editContent.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-50">
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


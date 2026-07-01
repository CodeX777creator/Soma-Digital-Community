"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bell, Trash2, CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { NotificationType } from "@/lib/notifications";

// Helper to get a meaningful URL for a notification
// Returns null if there's no specific actionable URL
function getNotificationActionUrl(
  linkUrl: string | undefined,
  type: NotificationType,
  notificationId: string
): string | null {
  // If no linkUrl provided, return null (hide "View details")
  if (!linkUrl) return null;

  // If it's a generic dashboard link, treat as no specific action
  // unless it's a specific path within dashboard
  if (linkUrl === "/dashboard" || linkUrl === "/notifications") {
    // For certain notification types, we could derive better URLs
    // But for now, we'll hide "View details" for generic links
    return null;
  }

  // Return the specific linkUrl for meaningful targets
  return linkUrl;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const {
    notifications,
    loading,
    unreadCount,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications(user?.uid);
  const { toast } = useToast();

  const sortedNotifications = useMemo(
    () => [...notifications].sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [notifications]
  );

  const handleClearAll = async () => {
    if (!user?.uid) return;
    try {
      await clearAllNotifications();
      toast({ title: "Notifications cleared", description: "All notifications have been removed." });
    } catch (error) {
      toast({ title: "Unable to clear", description: "Please try again." });
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      toast({ title: "Marked read", description: "This notification is now marked as read." });
    } catch (error) {
      toast({ title: "Unable to mark read", description: "Please try again." });
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
      toast({ title: "Removed", description: "The notification was deleted." });
    } catch (error) {
      toast({ title: "Unable to delete", description: "Please try again." });
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-700 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-bold font-headline">Notifications</h1>
              <p className="text-muted-foreground mt-2">Updates from your account, community, and membership.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-semibold text-white">{unreadCount}</span> unread
              </div>
              <Button onClick={handleClearAll} disabled={loading || notifications.length === 0} variant="secondary">
                Clear all
              </Button>
            </div>
          </div>

          {loading ? (
            <GlassCard className="p-8 text-muted-foreground">Loading notifications...</GlassCard>
          ) : sortedNotifications.length === 0 ? (
            <GlassCard className="p-12 text-center flex flex-col items-center gap-4">
              <Bell className="w-10 h-10 text-primary" />
              <h2 className="text-2xl font-bold">No notifications yet</h2>
              <p className="text-muted-foreground max-w-sm">
                Your feed will show activity as your account grows. Head back to the dashboard to discover missions, mentor advice, and community updates.
              </p>
              <Link href="/dashboard">
                <Button className="mt-4">Back to dashboard</Button>
              </Link>
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedNotifications.map((item) => {
                const timestampLabel = item.createdAt?.toDate
                  ? formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true })
                  : "just now";

                const actionUrl = getNotificationActionUrl(item.linkUrl, item.type, item.id);

                return (
                  <GlassCard
                    key={item.id}
                    className={`p-5 border ${!item.readAt ? "border-primary/30 bg-white/5" : "border-white/10 bg-white/5"}`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white break-words">{item.title}</p>
                          {!item.readAt && <Badge className="bg-primary text-[10px]">NEW</Badge>}
                          {/* Show notification type badge for clarity */}
                          <Badge variant="outline" className="text-[9px] capitalize border-white/10 text-muted-foreground">
                            {item.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed break-words">{item.body}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{timestampLabel}</span>
                          {actionUrl && (
                            <>
                              <span aria-hidden="true">·</span>
                              <Link href={actionUrl} className="text-primary hover:underline">
                                View details
                              </Link>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap justify-end">
                        {!item.readAt && (
                          <Button size="sm" variant="outline" className="h-10" onClick={() => handleMarkRead(item.id)}>
                            <CheckCircle2 className="w-4 h-4 mr-2" /> Mark read
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-10 text-muted-foreground" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

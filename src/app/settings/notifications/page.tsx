"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PushNotificationSettings } from "@/components/settings/PushNotificationSettings";
import { Bell, BellOff, Mail, Smartphone, Globe, XCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { auth } from "@/lib/firebase";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";

export default function SettingsNotificationsPage() {
  const { userData } = useAuth();
  const [emailMarketingOptIn, setEmailMarketingOptIn] = useState(false);
  const [emailPreferenceSaving, setEmailPreferenceSaving] = useState(false);
  const [emailPreferenceMessage, setEmailPreferenceMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmailMarketingOptIn(userData?.emailMarketingOptIn === true);
  }, [userData?.emailMarketingOptIn]);

  async function updateEmailMarketingPreference(value: boolean) {
    setEmailMarketingOptIn(value);
    setEmailPreferenceSaving(true);
    setEmailPreferenceMessage(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Your session has expired.");
      const response = await fetch("/api/settings/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emailMarketingOptIn: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save email preference.");
      setEmailPreferenceMessage(value ? "You are subscribed to SDC newsletters." : "You are unsubscribed from SDC marketing emails.");
    } catch (error) {
      setEmailMarketingOptIn(!value);
      setEmailPreferenceMessage(error instanceof Error ? error.message : "Unable to save email preference.");
    } finally {
      setEmailPreferenceSaving(false);
    }
  }

  const notificationSettings = [
    {
      id: "email-updates",
      title: "Email Updates",
      description: "Receive digest emails with important updates and summaries",
      icon: <Mail className="w-5 h-5" />,
      defaultEnabled: true,
    },
    {
      id: "community-activity",
      title: "Community Activity",
      description: "Get notified about new posts, comments, and discussions",
      icon: <Globe className="w-5 h-5" />,
      defaultEnabled: true,
    },
    {
      id: "mentor-messages",
      title: "Mentor Messages",
      description: "Receive notifications when mentors reply to your questions",
      icon: <Bell className="w-5 h-5" />,
      defaultEnabled: true,
    },
    {
      id: "course-updates",
      title: "Course Updates",
      description: "Get notified about new content, assignments, and progress",
      icon: <Smartphone className="w-5 h-5" />,
      defaultEnabled: true,
    },
    {
      id: "billing-notifications",
      title: "Billing Notifications",
      description: "Receive important information about your subscription and payments",
      icon: <Bell className="w-5 h-5" />,
      defaultEnabled: true,
    },
  ];

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-700 py-8">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-4xl font-bold font-headline">Notification Settings</h1>
              <p className="text-muted-foreground mt-2">
                Manage how you receive notifications from Soma Digital Community.
              </p>
            </div>
          </div>

          {/* Push Notifications Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Push Notifications</h2>
            <PushNotificationSettings />
          </div>

          <Separator />

          {/* Email & In-App Settings */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Notification Preferences</h2>
            <GlassCard className="p-6">
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Choose which types of notifications you want to receive. These preferences work across all your devices.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><Mail className="h-5 w-5" /></div>
                      <div>
                        <p className="font-medium text-white">SDC newsletters and email campaigns</p>
                        <p className="text-sm text-muted-foreground">Receive product news, learning updates, and useful community campaigns. You can unsubscribe at any time.</p>
                        {emailPreferenceMessage ? <p role="status" className="mt-1 text-xs text-cyan-200">{emailPreferenceMessage}</p> : null}
                      </div>
                    </div>
                    <Switch checked={emailMarketingOptIn} disabled={emailPreferenceSaving} onCheckedChange={updateEmailMarketingPreference} aria-label="Receive SDC newsletters and marketing emails" />
                  </div>
                  {notificationSettings.map((setting) => (
                    <div key={setting.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-primary">
                          {setting.icon}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white">{setting.title}</p>
                          <p className="text-sm text-muted-foreground">{setting.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch defaultChecked={setting.defaultEnabled} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Notification Types Info */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Notification Types</h2>
            <GlassCard className="p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Activity Notifications</h3>
                  <Ul>
                    <Li>New posts in communities you follow</Li>
                    <Li>Comments on your content</Li>
                    <Li>Replies to your messages</Li>
                    <Li>Like and engagement notifications</Li>
                  </Ul>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">System Notifications</h3>
                  <Ul>
                    <Li>Course updates and new content</Li>
                    <Li>Mentor responses and feedback</Li>
                    <Li>Billing and subscription updates</Li>
                    <Li>Platform announcements</Li>
                  </Ul>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Help Section */}
          <GlassCard className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Need Help?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  If you're not receiving notifications as expected, please check your browser settings and ensure notifications are allowed for this site.
                  You can also visit our <Link href="/support" className="text-primary hover:underline">support page</Link> for more assistance.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Helper components
function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2 text-sm text-muted-foreground">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 text-green-400 shrink-0" /><span>{children}</span></li>;
}

function Link({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className}>{children}</a>;
}

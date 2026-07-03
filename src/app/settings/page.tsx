"use client";

import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  User,
  Bell,
  Shield,
  ChevronRight,
  Crown,
  Zap,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useUserStore } from "@/store/useUserStore";

export default function SettingsPage() {
  const { userData } = useAuth();
  const tier = useUserStore((state) => state.tier);
  
  const currentPlan = tier;
  const isActive = currentPlan !== "explorer";

  const getPlanBadge = () => {
    switch (currentPlan) {
      case "elite":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] uppercase">
            <Crown className="w-3 h-3 mr-1" /> Elite
          </Badge>
        );
      case "pro":
        return (
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] uppercase">
            <Zap className="w-3 h-3 mr-1" /> Pro
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] uppercase border-white/20">
            Explorer
          </Badge>
        );
    }
  };

  const settingsSections = [
    {
      icon: <User className="w-5 h-5" />,
      title: "Profile",
      description: "Update your personal information and public profile",
      href: "/profile",
      badge: null,
    },
    {
      icon: <CreditCard className="w-5 h-5" />,
      title: "Billing & Subscription",
      description: "Manage your plan, payment methods, and billing history",
      href: "/settings/billing",
      badge: getPlanBadge(),
    },
    {
      icon: <Bell className="w-5 h-5" />,
      title: "Notifications",
      description: "Configure your notification preferences and push settings",
      href: "/settings/notifications",
      badge: null,
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Privacy & Security",
      description: "Manage your account security and privacy settings",
      href: "#",
      badge: <Badge variant="outline" className="text-[10px] border-white/20">Soon</Badge>,
      disabled: true,
    },
  ];

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-700 py-8">
          <div>
            <h1 className="text-4xl font-bold font-headline">Settings</h1>
            <p className="text-muted-foreground mt-2">
              Manage your account settings and preferences.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {settingsSections.map((section) => (
              <GlassCard
                key={section.title}
                className={`p-5 ${section.disabled ? "opacity-50" : "hover:bg-white/[0.03] cursor-pointer transition-colors"}`}
              >
                {section.disabled ? (
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground">
                      {section.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{section.title}</h3>
                        {section.badge}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Link href={section.href} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-primary">
                      {section.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{section.title}</h3>
                        {section.badge}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </Link>
                )}
              </GlassCard>
            ))}
          </div>

          {/* Account Info */}
          <GlassCard className="p-5">
            <h3 className="font-bold mb-4">Account Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{userData?.email || "Not available"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member since</span>
                <span>
                  {userData?.createdAt
                    ? new Date(userData.createdAt.toDate()).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account status</span>
                <span className={isActive ? "text-green-400" : "text-muted-foreground"}>
                  {isActive ? "Active" : "Free Plan"}
                </span>
              </div>
            </div>
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

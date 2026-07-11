"use client";

import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/store/useUserStore";
import { getUpgradeLabel, getUpgradeTarget } from "@/lib/plan-ui";
import {
  Target,
  Zap,
  Users,
  Search,
  ArrowRight,
  Clock,
  Sparkles,
  Lock,
  Rocket,
} from "lucide-react";

interface Tool {
  id: string;
  icon: React.ReactNode;
  title: string;
  shortDesc: string;
  fullDesc: string;
  features: string[];
  estimatedRelease: string;
  tier: "explorer" | "pro" | "elite";
  href: string;
}

const tools: Tool[] = [
  {
    id: "strategy",
    icon: <Target className="w-8 h-8" />,
    title: "Strategy Builder",
    shortDesc: "AI-powered business strategy planning",
    fullDesc:
      "Transform your ideas into actionable business strategies with AI-guided templates. From SWOT analysis to go-to-market plans, build comprehensive strategies that actually work.",
    features: [
      "Business Model Canvas builder",
      "SWOT & competitive analysis",
      "Go-to-market strategy templates",
      "AI strategy recommendations",
      "Export to PDF & presentations",
    ],
    estimatedRelease: "Phase 2 - Q3 2026",
    tier: "explorer",
    href: "/tools/strategy",
  },
  {
    id: "autopilot",
    icon: <Zap className="w-8 h-8" />,
    title: "Autopilot",
    shortDesc: "Automate your growth workflows",
    fullDesc:
      "Put your growth on autopilot with intelligent automation. Schedule posts, automate follow-ups, and trigger actions based on events. Save 10+ hours per week.",
    features: [
      "Visual workflow builder",
      "Scheduled content posting",
      "Automated follow-up sequences",
      "Smart trigger conditions",
      "Integration with 50+ platforms",
    ],
    estimatedRelease: "Phase 2 - Q3 2026",
    tier: "pro",
    href: "/tools/autopilot",
  },
  {
    id: "network",
    icon: <Users className="w-8 h-8" />,
    title: "Network CRM",
    shortDesc: "Manage your founder relationships",
    fullDesc:
      "Your personal CRM for founder relationships. Track connections, manage outreach pipelines, and never lose touch with valuable contacts. Turn connections into collaborations.",
    features: [
      "Contact management & notes",
      "Outreach pipeline tracking",
      "Message templates library",
      "Follow-up reminders",
      "LinkedIn import & sync",
    ],
    estimatedRelease: "Phase 2 - Q4 2026",
    tier: "pro",
    href: "/tools/network",
  },
  {
    id: "insights",
    icon: <Search className="w-8 h-8" />,
    title: "Insights",
    shortDesc: "Advanced analytics & performance tracking",
    fullDesc:
      "Deep dive into your performance with advanced analytics. Track XP growth, community engagement, and ROI. Compare with top performers and identify growth opportunities.",
    features: [
      "Performance dashboards",
      "Community engagement analytics",
      "ROI tracking & attribution",
      "Comparative benchmarking",
      "Custom report builder",
    ],
    estimatedRelease: "Phase 2 - Q4 2026",
    tier: "elite",
    href: "/tools/insights",
  },
];

export default function ToolsHubPage() {
  const tier = useUserStore((state) => state.tier);
  const upgradeTarget = getUpgradeTarget(tier);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-700 py-8">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto">
            <Badge className="bg-primary/20 text-primary border-primary/30 mb-4">
              <Rocket className="w-3 h-3 mr-1" /> Phase 2 Preview
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold font-headline">
              Power Tools
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              The next generation of tools to accelerate your digital business growth. 
              Coming soon to Soma Digital.
            </p>
          </div>

          {/* Phase 2 Announcement */}
          <GlassCard className="p-6 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 border-primary/20">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold">Phase 2 is Coming</h2>
                <p className="text-muted-foreground mt-1">
                  We&apos;re building these powerful tools to help you scale faster. 
                  Join <strong>100+ founders</strong> who will get early access when we launch.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                <Clock className="w-4 h-4" />
                <span>Launching Q3-Q4 2026</span>
              </div>
            </div>
          </GlassCard>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tools.map((tool) => {
              const isLocked = tool.tier !== "explorer" && tier === "explorer";
              const toolTierLabel = tool.tier === "elite" ? "Elite" : tool.tier === "pro" ? "Pro" : "Free";

              return (
                <Link key={tool.id} href={tool.href}>
                  <GlassCard className="h-full p-6 hover:bg-white/[0.03] transition-all group cursor-pointer border-white/10 hover:border-primary/30">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        {tool.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold">{tool.title}</h3>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase ${
                              tool.tier === "elite"
                                ? "border-yellow-500/30 text-yellow-400"
                                : tool.tier === "pro"
                                ? "border-cyan-500/30 text-cyan-400"
                                : "border-white/20"
                            }`}
                          >
                            {isLocked && <Lock className="w-2.5 h-2.5 mr-1" />}
                            {toolTierLabel}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tool.shortDesc}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mt-4 line-clamp-2">
                      {tool.fullDesc}
                    </p>

                    <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <Clock className="w-3 h-3" />
                      {tool.estimatedRelease}
                    </div>

                    <div className="mt-4 flex items-center text-primary text-sm font-medium group-hover:underline">
                      Preview features
                      <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </GlassCard>
                </Link>
              );
            })}
          </div>

          {/* CTA Section */}
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Want early access to these tools?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={upgradeTarget ? `/dashboard?upgrade=${upgradeTarget}` : "/settings/billing"}>
                <Button className="bg-primary hover:bg-primary/90">
                  <Zap className="w-4 h-4 mr-2" /> {upgradeTarget ? getUpgradeLabel(tier) : "Manage Plan"}
                </Button>
              </Link>
              <Link href="/community">
                <Button variant="outline">
                  Join the Discussion
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Pro & Elite members get priority access when Phase 2 launches
            </p>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

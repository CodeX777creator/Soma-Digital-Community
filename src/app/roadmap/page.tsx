"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Rocket,
  Target,
  Zap,
  BarChart3,
  Cpu,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface RoadmapStep {
  title: string;
  description: string;
}

interface ExecutionStep {
  day: string;
  task: string;
  outcome: string;
}

interface UserRoadmap {
  roadmapTitle?: string;
  primaryOpportunity?: string;
  fastestRevenuePath?: string;
  aiGrowthForecast?: string;
  recommendedContentStrategy?: string;
  monetizationStrategy?: string;
  thirtyDayExecutionPlan?: ExecutionStep[];
  steps?: RoadmapStep[];
}

export default function MyRoadmap() {
  const { user } = useAuth();
  const [roadmap, setRoadmap] = useState<UserRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'strategy'>('overview');

  useEffect(() => {
    if (!user?.uid || !db) {
      setLoading(false);
      return;
    }

    const roadmapRef = doc(db, "users", user.uid, "roadmaps", "current");
    return onSnapshot(
      roadmapRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setRoadmap(snapshot.data() as UserRoadmap);
        } else {
          setRoadmap(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load strategy roadmap:", error);
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex flex-col gap-8 max-w-5xl mx-auto py-8 relative animate-in fade-in duration-700">
          {loading ? (
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-semibold tracking-wider uppercase font-mono">Retrieving your strategy...</p>
            </div>
          ) : !roadmap ? (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                <HelpCircle className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-md">
                <h1 className="text-3xl font-bold font-headline">No Strategy Found</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  You haven't generated an AI digital wealth strategy yet, or your previous plan was not complete. Get started with your custom growth framework.
                </p>
              </div>
              <Button asChild className="h-12 px-6 rounded-xl font-bold blue-glow">
                <Link href="/open?step=1">
                  Generate Your Roadmap <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5" />
                  Custom Strategy
                </div>
                <h1 className="text-4xl md:text-6xl font-bold font-headline tracking-tighter blue-glow-text">
                  {roadmap.roadmapTitle || "Your Digital Wealth Roadmap"}
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Your personalized framework and action steps, active and stored securely in your profile.
                </p>
              </div>

              {/* Navigation Tabs */}
              <div className="flex justify-center gap-2 mb-4">
                {[
                  { id: 'overview', label: 'Overview', icon: <Target className="w-4 h-4" /> },
                  { id: 'plan', label: '30-Day Plan', icon: <Calendar className="w-4 h-4" /> },
                  { id: 'strategy', label: 'Strategy Steps', icon: <Cpu className="w-4 h-4" /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all border",
                      activeTab === tab.id
                        ? "bg-primary text-white border-primary blue-glow"
                        : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div
                    key="overview"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    exit="hidden"
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  >
                    <GlassCard className="p-8 space-y-4 border-primary/20 bg-primary/5">
                      <div className="flex items-center gap-3 text-primary">
                        <Rocket className="w-6 h-6" />
                        <h3 className="text-xl font-bold uppercase tracking-wider">Primary Opportunity</h3>
                      </div>
                      <p className="text-lg leading-relaxed text-white/90">
                        {roadmap.primaryOpportunity}
                      </p>
                    </GlassCard>

                    <GlassCard className="p-8 space-y-4 border-accent/20 bg-accent/5">
                      <div className="flex items-center gap-3 text-accent">
                        <Zap className="w-6 h-6" />
                        <h3 className="text-xl font-bold uppercase tracking-wider">Fastest Revenue Path</h3>
                      </div>
                      <p className="text-lg leading-relaxed text-white/90">
                        {roadmap.fastestRevenuePath}
                      </p>
                    </GlassCard>

                    <GlassCard className="p-8 space-y-4 border-white/10">
                      <div className="flex items-center gap-3 text-white/60">
                        <BarChart3 className="w-6 h-6" />
                        <h3 className="text-xl font-bold uppercase tracking-wider">Growth Forecast</h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {roadmap.aiGrowthForecast}
                      </p>
                    </GlassCard>

                    <GlassCard className="p-8 space-y-4 border-white/10">
                      <div className="flex items-center gap-3 text-white/60">
                        <LayoutDashboard className="w-6 h-6" />
                        <h3 className="text-xl font-bold uppercase tracking-wider">Content Strategy</h3>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {roadmap.recommendedContentStrategy}
                      </p>
                    </GlassCard>
                  </motion.div>
                )}

                {activeTab === 'plan' && (
                  <motion.div
                    key="plan"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    {roadmap.thirtyDayExecutionPlan?.map((step, idx) => (
                      <GlassCard key={idx} className="p-6 border-white/5 hover:border-primary/20 transition-colors">
                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                          <div className="w-24 flex-shrink-0 text-center py-2 px-4 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xs font-bold text-primary uppercase block">Period</span>
                            <span className="text-xl font-bold text-white">{step.day}</span>
                          </div>
                          <div className="flex-1 space-y-1">
                            <h4 className="text-xl font-bold text-white">{step.task}</h4>
                            <p className="text-muted-foreground">{roadmap.monetizationStrategy}</p>
                          </div>
                          <div className="flex items-center gap-2 text-primary font-bold bg-primary/10 px-4 py-2 rounded-lg border border-primary/20">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm">{step.outcome}</span>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </motion.div>
                )}

                {activeTab === 'strategy' && (
                  <motion.div
                    key="strategy"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6"
                  >
                    {roadmap.steps?.map((step, idx) => (
                      <GlassCard key={idx} className="p-6 border-white/10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {idx + 1}
                        </div>
                        <h4 className="text-lg font-bold">{step.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      </GlassCard>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

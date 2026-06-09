"use client";

import { useState, useEffect } from "react";
import { useUserStore } from "@/store/useUserStore";
import { useAuth } from "@/providers/AuthProvider";
import { dbService } from "@/lib/db";
import { awardXP } from "@/lib/xp";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, Sparkles, Target, Zap, Trophy, Shield, Check, 
  ArrowRight, X, Loader2, RefreshCw, CheckCircle2, ChevronRight,
  Brain, Cpu, HelpCircle, Flame, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function GrowthEngine() {
  const { user, userData } = useAuth();
  const { 
    ownsLegacyBuilders,
    engagementScore,
    growthAssessmentResult,
    growthAssessmentDismissed,
    incrementEngagementScore,
    setLegacyBuildersOwnership,
    setGrowthAssessmentResult,
    dismissGrowthAssessment,
    resetGrowthAssessment
  } = useUserStore();

  // Onboarding & trigger simulation states
  const [showPopup, setShowPopup] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  
  // Simulator testing variables
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [simulatedDays, setSimulatedDays] = useState(0);

  // Form State
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const [q3, setQ3] = useState<string | null>(null);
  const [q4, setQ4] = useState<string | null>(null);
  const [q5, setQ5] = useState<string[]>([]);

  // Compute actual joinedDays
  const joinedDays = (() => {
    if (simulatedDays > 0) return simulatedDays;
    if (!userData?.createdAt) return 0;
    const createdTime = userData.createdAt.toDate 
      ? userData.createdAt.toDate().getTime() 
      : new Date(userData.createdAt).getTime();
    return Math.floor((Date.now() - createdTime) / (1000 * 60 * 60 * 24));
  })();

  // Core Trigger Logic
  useEffect(() => {
    if (!user || !userData) return;
    
    const onboardingComplete = userData.onboardingComplete || false;
    const qualifies = 
      joinedDays >= 3 && 
      onboardingComplete && 
      engagementScore > 40 && 
      !ownsLegacyBuilders && 
      !growthAssessmentResult &&
      !growthAssessmentDismissed;

    if (qualifies) {
      // Soft trigger display delay for premium feel
      const t = setTimeout(() => {
        setShowPopup(true);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [user, userData, joinedDays, engagementScore, ownsLegacyBuilders, growthAssessmentResult, growthAssessmentDismissed]);

  if (!user || !userData) return null;

  const toggleQ5Option = (opt: string) => {
    setQ5(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
  };

  const handleStartAssessment = () => {
    setShowPopup(false);
    setIsOpen(true);
    setCurrentStep(1);
  };

  const handleDismiss = () => {
    setShowPopup(false);
    dismissGrowthAssessment();
    if (user) {
      dbService.saveUserProfile(user.uid, { growthAssessmentDismissed: true });
    }
  };

  const handleStepSubmit = () => {
    if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
    } else {
      runAIClassification();
    }
  };

  // Conversational AI Auditing Simulator
  const runAIClassification = () => {
    setIsAnalyzing(true);
    setAnalysisLogs([]);
    
    const logs = [
      "Establishing link with Soma Digital Hub...",
      `Auditing core growth objective: ${q2}...`,
      `Assessing strategic barriers and experience level: ${q4}...`,
      "Evaluating interest synergy with automation algorithms...",
      "Mapping custom implementation guidelines...",
      "Synthesizing customized trajectory match..."
    ];

    logs.forEach((log, index) => {
      setTimeout(() => {
        setAnalysisLogs(prev => [...prev, `[SOMA AI] ${log}`]);
        if (index === logs.length - 1) {
          setTimeout(() => {
            finalizeClassification();
          }, 800);
        }
      }, (index + 1) * 600);
    });
  };

  const finalizeClassification = async () => {
    // 1. Check Legacy Builders Ownership
    const confirmedOwned = q1 === "yes";

    // 2. Score Interest Alignment
    const interestAlignment = q5.length * 20; // 0 to 100%

    // 3. Compute Readiness
    let readinessLevel: "low" | "medium" | "high" = "medium";
    if (q4 === "advanced" || (q4 === "growing" && q3 !== "no_strategy")) {
      readinessLevel = "high";
    } else if (q4 === "beginner" && (q3 === "tech_overwhelm" || q3 === "no_strategy")) {
      readinessLevel = "low";
    }

    // 4. Recommend path
    let recommendedPath = "";
    if (confirmedOwned) {
      recommendedPath = "Legacy Builders Operators Circle";
    } else if (readinessLevel === "high" || (readinessLevel === "medium" && interestAlignment >= 60)) {
      recommendedPath = "Legacy Builders Program Acceleration";
    } else {
      recommendedPath = "SDC Foundational Growth & AI Mentor Paths";
    }

    const classificationResult = {
      ownsLegacyBuilders: confirmedOwned,
      readinessLevel,
      businessStage: (q4 as "beginner" | "growing" | "advanced") || "beginner",
      interestAlignment,
      recommendedPath
    };

    setGrowthAssessmentResult(classificationResult);
    if (confirmedOwned) {
      setLegacyBuildersOwnership(true);
    }

    // Save user profile state in Firestore
    await dbService.saveUserProfile(user.uid, {
      ownsLegacyBuilders: confirmedOwned,
      growthAssessmentResult: classificationResult
    });
    await awardXP(user.uid, 20, 'profile', { growthAssessmentResult: classificationResult });

    setIsAnalyzing(false);
    setCurrentStep(6); // Final Results state
  };

  // Testing Overrides for the Developer Sandbox Panel
  const simulateEngagementIncrease = () => {
    incrementEngagementScore(50);
    dbService.saveUserProfile(user.uid, { engagementScore: engagementScore + 50 });
  };

  const simulateAgeIncrease = () => {
    setSimulatedDays(3);
  };

  const forcePopupTrigger = () => {
    setSimulatedDays(3);
    incrementEngagementScore(50);
    setShowPopup(true);
  };

  const resetAllStates = () => {
    resetGrowthAssessment();
    setSimulatedDays(0);
    setShowPopup(false);
    setIsOpen(false);
    setQ1(null);
    setQ2(null);
    setQ3(null);
    setQ4(null);
    setQ5([]);
    dbService.saveUserProfile(user.uid, {
      ownsLegacyBuilders: false,
      engagementScore: 0,
      growthAssessmentResult: null,
      growthAssessmentDismissed: false
    });
  };

  return (
    <>
      {/* ── SOFT TRIGGER POPUP ALERT ────────────────────────────────────────── */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[200] max-w-sm w-full p-[1px] rounded-3xl bg-gradient-to-r from-primary/40 via-accent/40 to-primary/40 shadow-[0_0_50px_rgba(26,102,255,0.25)]"
          >
            <GlassCard className="p-6 bg-slate-950/90 backdrop-blur-2xl rounded-[1.75rem] border-none text-left flex flex-col gap-4 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />
              
              <button 
                onClick={handleDismiss}
                title="Dismiss"
                aria-label="Dismiss growth path notification"
                className="absolute top-4 right-4 text-muted-foreground hover:text-white p-1 rounded-lg bg-white/5 border border-white/10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center blue-glow shrink-0 animate-pulse">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Soma AI Intelligence Layer</h4>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Trajectory audit available</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-white/80 leading-relaxed italic">
                  "Based on your activity patterns and income objectives, Soma AI has computed a potential growth acceleration path for you."
                </p>
              </div>

              <div className="flex gap-2 mt-2">
                <Button 
                  onClick={handleStartAssessment}
                  className="flex-1 bg-primary hover:bg-primary/95 text-white font-bold text-xs h-10 rounded-xl blue-glow gap-2 group transition-all"
                >
                  Start Discovery Audit
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONVERSATIONAL ASSESSMENT SYSTEM OVERLAY ──────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="animated-bg pointer-events-none">
              <div className="absolute inset-0 grid-bg opacity-15" />
              <div className="glow-particle w-[600px] h-[600px] bg-primary top-[10%] left-[20%] opacity-20 animate-pulse-glow" />
              <div className="glow-particle w-[500px] h-[500px] bg-accent bottom-[10%] right-[20%] opacity-20 animate-pulse-glow" />
            </div>

            <GlassCard className="max-w-3xl w-full p-8 md:p-12 bg-slate-950/85 border border-white/5 rounded-[2.5rem] relative shadow-[0_0_80px_rgba(26,102,255,0.15)] overflow-hidden z-10">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 pointer-events-none" />

              {/* Close out button */}
              <button 
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close growth path discovery"
                className="absolute top-6 right-6 text-muted-foreground hover:text-white p-2 rounded-xl bg-white/5 border border-white/10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Assessment Progress Header */}
              {currentStep <= 5 && (
                <div className="flex flex-col gap-6 mb-8 text-center items-center">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    <span className="text-[10px] font-bold tracking-[0.3em] text-muted-foreground uppercase">SOMA GROWTH DISCOVERY</span>
                  </div>
                  <div className="flex gap-2 w-full max-w-sm h-1 bg-white/5 rounded-full overflow-hidden">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "h-full flex-1 rounded-full transition-all duration-500",
                          currentStep > i ? "bg-primary blue-glow" : "bg-white/5"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {/* ── QUESTION 1: LEGACY BUILDERS CHECK ── */}
                {currentStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl md:text-3xl font-bold font-headline">Verify Ecosystem Credentials</h3>
                      <p className="text-muted-foreground text-sm">To align SOMA AI, please specify your current relationship with our core ecosystem.</p>
                    </div>

                    <div className="flex flex-col gap-4 max-w-xl mx-auto">
                      {[
                        { id: "yes", title: "Yes, I own the Legacy Builders program", desc: "I have joined the program and want to scale my implementation." },
                        { id: "mrr", title: "No, but I own another marketing/monetization system", desc: "I have studied online funnels or masterminds elsewhere." },
                        { id: "no", title: "No, I do not own any automated monetization systems", desc: "I am looking for a structured infrastructure to launch." }
                      ].map(opt => (
                        <div 
                          key={opt.id}
                          onClick={() => setQ1(opt.id)}
                          className={cn(
                            "p-5 rounded-2xl border cursor-pointer flex justify-between items-center transition-all duration-300",
                            q1 === opt.id 
                              ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(26,102,255,0.1)]" 
                              : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
                          )}
                        >
                          <div>
                            <p className="font-bold text-sm">{opt.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                          </div>
                          <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", q1 === opt.id ? "bg-primary border-primary" : "border-white/20")}>
                            {q1 === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-center">
                      <Button 
                        disabled={!q1}
                        onClick={handleStepSubmit}
                        className="h-12 px-8 rounded-full bg-primary hover:bg-primary/95 font-bold text-sm blue-glow gap-2"
                      >
                        Continue Audit
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── QUESTION 2: FINANCIAL GOALS ── */}
                {currentStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl md:text-3xl font-bold font-headline">Growth Objectives</h3>
                      <p className="text-muted-foreground text-sm">Define the specific target you are directing SOMA AI to formulate.</p>
                    </div>

                    <div className="flex flex-col gap-4 max-w-xl mx-auto">
                      {[
                        { id: "side_income", title: "Side Income Stream", desc: "Build a dependable, high-margin secondary revenue engine." },
                        { id: "full_time", title: "Full-Time Autonomy", desc: "Replace completely with primary, high-volume digital cash flow." },
                        { id: "automation", title: "Automation & Leverage", desc: "Build passive monetization pipelines running on 100% autopilot." },
                        { id: "audience", title: "Audience & Community", desc: "Monetize specialized content and a dedicated partner circle." },
                        { id: "scale", title: "Scale Existing Business", desc: "Scale current workflows to $50,000+ monthly recurring revenue." }
                      ].map(opt => (
                        <div 
                          key={opt.id}
                          onClick={() => setQ2(opt.id)}
                          className={cn(
                            "p-4 rounded-2xl border cursor-pointer flex justify-between items-center transition-all duration-300",
                            q2 === opt.id 
                              ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(26,102,255,0.1)]" 
                              : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
                          )}
                        >
                          <div>
                            <p className="font-bold text-sm">{opt.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                          <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", q2 === opt.id ? "bg-primary border-primary" : "border-white/20")}>
                            {q2 === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button variant="ghost" className="rounded-full border border-white/10" onClick={() => setCurrentStep(1)}>Back</Button>
                      <Button 
                        disabled={!q2}
                        onClick={handleStepSubmit}
                        className="h-12 px-8 rounded-full bg-primary hover:bg-primary/95 font-bold text-sm blue-glow gap-2"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── QUESTION 3: BOTTLENECKS ── */}
                {currentStep === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl md:text-3xl font-bold font-headline">Core Bottlenecks</h3>
                      <p className="text-muted-foreground text-sm">Select the primary system drag you are currently facing.</p>
                    </div>

                    <div className="flex flex-col gap-4 max-w-xl mx-auto">
                      {[
                        { id: "no_audience", title: "No Traffic or Audience", desc: "No visibility. I struggle to get consistent leads." },
                        { id: "no_strategy", title: "No Clear Actionable Roadmap", desc: "Confusion. I am drowning in information but have no strategy." },
                        { id: "tech_overwhelm", title: "Technical Overwhelm", desc: "Tech blocker. I struggle setting up funnels, integrations, and email chains." },
                        { id: "inconsistency", title: "Execution Inconsistency", desc: "Focus leak. I struggle to build momentum and maintain consistent execution." },
                        { id: "no_sales", title: "No Conversion / Sales Pipeline", desc: "Sales barrier. I have ideas or traffic, but zero paying customers." }
                      ].map(opt => (
                        <div 
                          key={opt.id}
                          onClick={() => setQ3(opt.id)}
                          className={cn(
                            "p-4 rounded-2xl border cursor-pointer flex justify-between items-center transition-all duration-300",
                            q3 === opt.id 
                              ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(26,102,255,0.1)]" 
                              : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
                          )}
                        >
                          <div>
                            <p className="font-bold text-sm">{opt.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                          <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", q3 === opt.id ? "bg-primary border-primary" : "border-white/20")}>
                            {q3 === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button variant="ghost" className="rounded-full border border-white/10" onClick={() => setCurrentStep(2)}>Back</Button>
                      <Button 
                        disabled={!q3}
                        onClick={handleStepSubmit}
                        className="h-12 px-8 rounded-full bg-primary hover:bg-primary/95 font-bold text-sm blue-glow gap-2"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── QUESTION 4: EXPERIENCE LEVEL ── */}
                {currentStep === 4 && (
                  <motion.div
                    key="step-4"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl md:text-3xl font-bold font-headline">Experience Level</h3>
                      <p className="text-muted-foreground text-sm">Where are you operating on the scale of online systems execution?</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
                      {[
                        { id: "beginner", title: "Beginner", desc: "Starting completely from scratch. No funnels or digital sales systems deployed yet." },
                        { id: "growing", title: "Growing", desc: "Understanding funnels and marketing. Generated some income but seeking absolute structure." },
                        { id: "advanced", title: "Advanced", desc: "Running active monetization systems. Scaling workflows and optimizing processes." }
                      ].map(opt => (
                        <div 
                          key={opt.id}
                          onClick={() => setQ4(opt.id)}
                          className={cn(
                            "p-6 rounded-2xl border cursor-pointer flex flex-col justify-between gap-4 transition-all duration-300 relative overflow-hidden group",
                            q4 === opt.id 
                              ? "border-primary bg-primary/5 scale-[1.03] shadow-[0_0_20px_rgba(26,102,255,0.1)]" 
                              : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
                          )}
                        >
                          <div>
                            <h4 className={cn("font-bold text-lg", q4 === opt.id ? "text-primary" : "text-white")}>{opt.title}</h4>
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{opt.desc}</p>
                          </div>
                          <div className="flex justify-end">
                            <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", q4 === opt.id ? "bg-primary border-primary" : "border-white/20")}>
                              {q4 === opt.id && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button variant="ghost" className="rounded-full border border-white/10" onClick={() => setCurrentStep(3)}>Back</Button>
                      <Button 
                        disabled={!q4}
                        onClick={handleStepSubmit}
                        className="h-12 px-8 rounded-full bg-primary hover:bg-primary/95 font-bold text-sm blue-glow gap-2"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── QUESTION 5: INTEREST SYNERGY ── */}
                {currentStep === 5 && (
                  <motion.div
                    key="step-5"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl md:text-3xl font-bold font-headline">Ecosystem Synergies</h3>
                      <p className="text-muted-foreground text-sm">Select the business mechanics that match your target vision. (Select all that apply)</p>
                    </div>

                    <div className="flex flex-col gap-3 max-w-xl mx-auto">
                      {[
                        { id: "products", label: "Digital Products & Programs", icon: "📦" },
                        { id: "affiliate", label: "Affiliate & Partner Monetization", icon: "🤝" },
                        { id: "communities", label: "Paid Communities & Group Coaching", icon: "👥" },
                        { id: "funnels", label: "Automated Funnels & Active Copywriting", icon: "⚡" },
                        { id: "high_ticket", label: "High-Ticket Advisory & Consultation", icon: "💎" }
                      ].map(opt => {
                        const isSelected = q5.includes(opt.id);
                        return (
                          <div 
                            key={opt.id}
                            onClick={() => toggleQ5Option(opt.id)}
                            className={cn(
                              "p-4 rounded-xl border cursor-pointer flex justify-between items-center transition-all duration-300",
                              isSelected 
                                ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(26,102,255,0.05)]" 
                                : "border-white/5 bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.03]"
                            )}
                          >
                            <span className="text-sm font-bold flex items-center gap-3">
                              <span className="text-lg">{opt.icon}</span>
                              {opt.label}
                            </span>
                            <div className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0", isSelected ? "bg-primary border-primary text-white" : "border-white/20")}>
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button variant="ghost" className="rounded-full border border-white/10" onClick={() => setCurrentStep(4)}>Back</Button>
                      <Button 
                        onClick={handleStepSubmit}
                        className="h-12 px-8 rounded-full bg-primary hover:bg-primary/95 font-bold text-sm blue-glow gap-2"
                      >
                        Submit Trajectory Audit
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── AI AUDITING SIMULATOR ── */}
                {isAnalyzing && (
                  <motion.div
                    key="analyzing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 gap-8 min-h-[400px]"
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="absolute w-24 h-24 rounded-full bg-primary/10 animate-ping opacity-60" />
                      <div className="w-20 h-20 bg-slate-900 border-2 border-primary rounded-full flex items-center justify-center z-10 blue-glow relative">
                        <Brain className="w-10 h-10 text-primary animate-pulse" />
                      </div>
                    </div>

                    <div className="text-center space-y-2 max-w-sm">
                      <h4 className="font-bold text-xl font-headline tracking-wide">SOMA AI Computing...</h4>
                      <p className="text-xs text-muted-foreground">Running trajectory audit against monetization mechanics and experience profiles.</p>
                    </div>

                    {/* Progress log outputs */}
                    <div className="w-full max-w-md p-4 rounded-xl bg-white/5 border border-white/5 font-mono text-[10px] text-left text-primary/80 space-y-2 h-36 overflow-hidden">
                      {analysisLogs.map((log, idx) => (
                        <div key={idx} className="flex gap-2 animate-in fade-in duration-300">
                          <span className="text-green-500 font-bold">&gt;</span>
                          <span className="text-white/80">{log}</span>
                        </div>
                      ))}
                      <div className="flex gap-2 items-center text-primary/40 animate-pulse">
                        <span>&gt;</span>
                        <span className="text-[9px] uppercase tracking-widest font-bold">processing telemetry...</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── RESULTS & CUSTOM ROUTING PATHS ── */}
                {currentStep === 6 && growthAssessmentResult && (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8 max-w-2xl mx-auto"
                  >
                    {/* CASE A: USER OWNS LEGACY BUILDERS */}
                    {growthAssessmentResult.ownsLegacyBuilders ? (
                      <div className="space-y-8 text-center animate-in fade-in duration-1000">
                        <div className="w-20 h-20 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center mx-auto cyan-glow">
                          <Trophy className="w-10 h-10 text-accent" />
                        </div>
                        
                        <div className="space-y-3">
                          <Badge className="bg-accent/10 border-accent/20 text-accent cyan-glow uppercase font-bold tracking-widest text-[9px] px-3 py-1">
                            LEGACY SYSTEM VALIDATED
                          </Badge>
                          <h3 className="text-3xl md:text-4xl font-bold font-headline">Welcome back, Legacy Operator.</h3>
                          <p className="text-muted-foreground text-sm max-w-md mx-auto">
                            Soma AI has successfully synced with your **Legacy Builders** credentials. Your community experience is now optimized for rapid operations deployment.
                          </p>
                        </div>

                        <GlassCard className="p-6 bg-accent/5 border-accent/20 text-left max-w-md mx-auto space-y-4">
                          <h4 className="font-bold text-xs uppercase text-accent tracking-widest flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Operator Unlocks Enabled
                          </h4>
                          <ul className="space-y-3 text-xs text-white/90">
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                              <span><strong>Legacy Builders Operators Circle</strong> Role unlocked in the community.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                              <span><strong>High-Velocity Checklists</strong> unlocked in the Strategy Center.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                              <span><strong>Advanced Automation Hub</strong> enabled in the AI Mentor panel.</span>
                            </li>
                          </ul>
                        </GlassCard>

                        <div className="flex justify-center">
                          <Button 
                            onClick={() => setIsOpen(false)}
                            className="bg-accent hover:bg-accent/90 text-black font-bold h-12 px-8 rounded-full cyan-glow"
                          >
                            Enter Operators Dashboard
                          </Button>
                        </div>
                      </div>
                    ) : growthAssessmentResult.readinessLevel === "high" || (growthAssessmentResult.readinessLevel === "medium" && growthAssessmentResult.interestAlignment >= 60) ? (
                      /* CASE B: USER IS A METICULOUS / QUALIFIED MATCH FOR THE LEGACY BUILDERS SYSTEM */
                      <div className="space-y-8 animate-in fade-in duration-1000">
                        <div className="text-center space-y-3">
                          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto blue-glow mb-4">
                            <Bot className="w-8 h-8 text-primary" />
                          </div>
                          <Badge className="bg-primary/10 border-primary/20 text-primary blue-glow uppercase font-bold tracking-widest text-[9px] px-3 py-1">
                            COMPATIBILITY: {80 + Math.floor(growthAssessmentResult.interestAlignment / 5)}% MATCH
                          </Badge>
                          <h3 className="text-3xl md:text-4xl font-bold font-headline leading-tight">Growth Acceleration Recommended.</h3>
                          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
                            Based on your goals of **{q2 === "automation" ? "passive wealth systems" : "building an online brand"}** and experience scale, SOMA AI recommends deploying our ultimate monetization infrastructure.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
                          <GlassCard className="p-5 flex flex-col gap-2.5 bg-white/[0.02]">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                              <Target className="w-4 h-4" /> Monetization Hub
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Move away from standard courses. Legacy Builders implements absolute automated infrastructure directly in your business layer.
                            </p>
                          </GlassCard>

                          <GlassCard className="p-5 flex flex-col gap-2.5 bg-white/[0.02]">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                              <Zap className="w-4 h-4" /> High-Yield Funnels
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Access immediate pre-engineered high-ticket sales pipelines, content monetization models, and scaling blueprints.
                            </p>
                          </GlassCard>
                        </div>

                        <div className="p-6 rounded-3xl border border-white/5 bg-slate-900/40 max-w-lg mx-auto text-center space-y-4">
                          <p className="text-xs text-white/90 leading-relaxed italic">
                            "A highly structured digital income ecosystem designed to automate your results. Discover how members scale to absolute freedom."
                          </p>
                          <div className="flex justify-center gap-6 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                            <span>📈 Scale Faster</span>
                            <span>⚡ Automate completely</span>
                            <span>👥 Elite network</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                          <a 
                            href="https://www.somatoday.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full max-w-sm"
                          >
                            <Button 
                              className="w-full bg-primary hover:bg-primary/95 text-white font-bold h-14 rounded-full blue-glow text-base gap-2 group transition-all"
                            >
                              Explore The Acceleration Path
                              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                          </a>
                          <span className="text-[10px] text-muted-foreground">Direct link to www.somatoday.com Legacy System checkout & funnels</span>
                        </div>
                      </div>
                    ) : (
                      /* CASE C: USER IS A BEGINNER / UNQUALIFIED FIT FOR DIRECT ACCELERATION */
                      <div className="space-y-8 text-center animate-in fade-in duration-1000">
                        <div className="w-20 h-20 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center mx-auto">
                          <Shield className="w-10 h-10 text-muted-foreground" />
                        </div>

                        <div className="space-y-3">
                          <Badge className="bg-white/5 border-white/10 text-muted-foreground uppercase font-bold tracking-widest text-[9px] px-3 py-1">
                            FOUNDATIONAL NURTURING PLAN ACTIVE
                          </Badge>
                          <h3 className="text-3xl font-bold font-headline">Tailored Foundations Path</h3>
                          <p className="text-muted-foreground text-sm max-w-md mx-auto">
                            To ensure high-momentum success and avoid tech overwhelm, SOMA AI recommends mastering SDC's foundational resource tracks first.
                          </p>
                        </div>

                        <GlassCard className="p-6 text-left max-w-md mx-auto space-y-4 bg-white/[0.01]">
                          <h4 className="font-bold text-xs uppercase text-primary tracking-widest flex items-center gap-2">
                            <Trophy className="w-4 h-4" /> Recommended SDC Action Steps
                          </h4>
                          <ul className="space-y-3 text-xs text-white/90">
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                              <span><strong>Foundational AI Mentoring</strong>: Engage in step-by-step business strategy threads daily.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                              <span><strong>Resource Vault</strong>: Review our beginner digital products checklists and strategy tools.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                              <span><strong>Community Hub</strong>: Network actively with Pro members inside the Global Feed.</span>
                            </li>
                          </ul>
                        </GlassCard>

                        <div className="flex justify-center">
                          <Button 
                            onClick={() => setIsOpen(false)}
                            className="bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold h-12 px-8 rounded-full"
                          >
                            Explore Free Resources
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DEVELOPER SANDBOX PANEL WIDGET ────────────────────────────────────── */}
      {/* Only show in development mode */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-6 left-6 z-[299]">
          <div className="relative">
            <button 
              onClick={() => setSandboxOpen(!sandboxOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-white/15 shadow-xl hover:bg-slate-800 transition-all text-[10px] font-mono font-bold tracking-wider text-primary cyan-glow"
            >
              <Cpu className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
              SANDBOX ENGINE PANEL
            </button>

            <AnimatePresence>
              {sandboxOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="absolute bottom-12 left-0 w-80 p-5 rounded-2xl bg-slate-950 border border-primary/30 shadow-[0_0_40px_rgba(26,102,255,0.2)] text-left flex flex-col gap-4 font-mono text-[10px]"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-bold text-xs text-primary uppercase tracking-widest flex items-center gap-2">
                      <Brain className="w-4 h-4" /> Telemetry Control
                    </span>
                    <X className="w-3.5 h-3.5 cursor-pointer text-muted-foreground hover:text-white" onClick={() => setSandboxOpen(false)} />
                  </div>

                  {/* State Displays */}
                  <div className="space-y-1.5 bg-white/5 p-3 rounded-lg border border-white/5 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Onboarding Complete:</span>
                      <span className="text-green-400 font-bold">{userData.onboardingComplete ? "TRUE" : "FALSE"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Online Days:</span>
                      <span className="text-primary font-bold">{joinedDays} days {simulatedDays > 0 ? "(MOCK)" : "(ACTUAL)"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Engagement Score:</span>
                      <span className="text-primary font-bold">{engagementScore}/40</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Owns Legacy Builders:</span>
                      <span className="text-accent font-bold">{ownsLegacyBuilders ? "TRUE" : "FALSE"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Audit Triggered/Dismissed:</span>
                      <span className="text-red-400 font-bold">{growthAssessmentResult ? "RESULTS DEPLOYED" : growthAssessmentDismissed ? "DISMISSED" : "PENDING"}</span>
                    </div>
                  </div>

                  {/* Simulated Modifiers */}
                  <div className="space-y-2">
                    <p className="text-muted-foreground uppercase text-[8px] font-bold tracking-wider">Engine State Modifiers:</p>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={simulateEngagementIncrease}
                        className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all font-bold"
                      >
                        +50 Engagement
                      </button>
                      <button 
                        onClick={simulateAgeIncrease}
                        className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all font-bold"
                      >
                        Set Age $\ge$ 3 days
                      </button>
                    </div>

                    <button 
                      onClick={forcePopupTrigger}
                      className="w-full py-2.5 px-3 rounded-lg bg-primary/20 border border-primary/50 hover:bg-primary/30 transition-all font-bold text-center text-primary"
                    >
                      Force Trigger Soft Popup
                    </button>

                    <button 
                      onClick={resetAllStates}
                      className="w-full py-2.5 px-3 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all font-bold text-center text-red-400 flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset Engine State
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </>
  );
}

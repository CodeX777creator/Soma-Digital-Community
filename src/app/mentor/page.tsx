"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Bot, Send, Loader2, Sparkles, CheckCircle2, ChevronRight, LayoutList } from "lucide-react";
import { generatePersonalizedRoadmap, PersonalizedRoadmapOutput } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";
import { aiMentorStrategicAdvice, AIMentorStrategicAdviceOutput } from "@/ai/flows/ai-mentor-strategic-advice-flow";

export default function MentorPage() {
  const [goals, setGoals] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [roadmap, setRoadmap] = useState<PersonalizedRoadmapOutput | null>(null);
  const [strategicAdvice, setStrategicAdvice] = useState<AIMentorStrategicAdviceOutput | null>(null);
  const [mode, setMode] = useState<'roadmap' | 'advice'>('roadmap');

  const handleGenerateRoadmap = async () => {
    if (!goals) return;
    setIsLoading(true);
    try {
      const res = await generatePersonalizedRoadmap({ businessGoals: goals });
      setRoadmap(res);
      setStrategicAdvice(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetAdvice = async () => {
    if (!goals) return;
    setIsLoading(true);
    try {
      const res = await aiMentorStrategicAdvice({
        topic: "General Business Strategy",
        businessDescription: "Emerging digital business based on: " + goals,
        userGoals: goals,
        currentChallenges: "Market validation and scaling."
      });
      setStrategicAdvice(res);
      setRoadmap(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column - Input */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center blue-glow">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-headline">AI Mentor</h1>
              <span className="text-xs text-accent font-bold uppercase tracking-wider">Gemini 2.5 Active</span>
            </div>
          </div>

          <GlassCard className="p-6 border-t-2 border-t-primary">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" /> What's on your mind?
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Your Goals & Challenges</label>
                <Textarea 
                  placeholder="e.g. I want to build a $10k/month AI-agency using cold outreach and LinkedIn..."
                  className="bg-white/5 border-white/10 min-h-[150px] resize-none focus:ring-primary"
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  onClick={() => { setMode('roadmap'); handleGenerateRoadmap(); }} 
                  disabled={isLoading || !goals}
                  className="w-full bg-primary hover:bg-primary/90 blue-glow h-12"
                >
                  {isLoading && mode === 'roadmap' ? <Loader2 className="animate-spin mr-2" /> : <LayoutList className="mr-2 w-4 h-4" />}
                  Generate Roadmap
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => { setMode('advice'); handleGetAdvice(); }} 
                  disabled={isLoading || !goals}
                  className="w-full border-white/10 hover:bg-white/5 h-12"
                >
                  {isLoading && mode === 'advice' ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 w-4 h-4" />}
                  Get Strategic Advice
                </Button>
              </div>
            </div>
          </GlassCard>

          <div className="flex items-center gap-2 p-4 rounded-xl bg-accent/5 border border-accent/20 text-xs text-accent">
            <Zap className="w-4 h-4 fill-accent" />
            <span>AI Mentor uses your profile data for better context.</span>
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="lg:col-span-8">
          {!roadmap && !strategicAdvice && !isLoading && (
            <div className="h-[500px] flex flex-col items-center justify-center text-center opacity-40">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8" />
              </div>
              <p className="text-lg">Enter your goals to receive <br />AI-powered mentorship.</p>
            </div>
          )}

          {isLoading && (
            <div className="h-[500px] flex flex-col items-center justify-center text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
              <p className="text-xl font-bold font-headline">Synthesizing strategy...</p>
              <p className="text-muted-foreground mt-2">Connecting to Legacy Hub intelligence network</p>
            </div>
          )}

          {roadmap && (
            <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold font-headline">{roadmap.roadmapTitle}</h2>
                <Badge className="bg-primary/20 text-primary border-primary/30">Personalized Plan</Badge>
              </div>
              
              <div className="space-y-6">
                {roadmap.steps.map((step, idx) => (
                  <GlassCard key={idx} className="relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-primary text-xl font-headline shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-xl font-bold font-headline group-hover:text-primary transition-colors">{step.title}</h4>
                        <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
              
              <Button className="w-full h-14 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl text-lg font-bold">
                Export Roadmap as PDF
              </Button>
            </div>
          )}

          {strategicAdvice && (
            <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-bold font-headline">Strategic Analysis</h2>
              
              <GlassCard glow className="p-8">
                <p className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap">
                  {strategicAdvice.strategicAdvice}
                </p>
              </GlassCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  <h3 className="font-bold text-xl font-headline flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-accent" /> Actionable Steps
                  </h3>
                  <div className="space-y-3">
                    {strategicAdvice.actionableSteps.map((step, i) => (
                      <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm flex items-start gap-3">
                        <span className="text-accent font-bold mt-0.5">•</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h3 className="font-bold text-xl font-headline flex items-center gap-2">
                    <ChevronRight className="w-5 h-5 text-primary" /> Roadmap Adjustments
                  </h3>
                  <div className="p-6 rounded-xl bg-primary/5 border border-primary/20 text-sm leading-relaxed text-muted-foreground italic">
                    {strategicAdvice.personalizedRoadmapAdjustments}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

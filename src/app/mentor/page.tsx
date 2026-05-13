"use client";

import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Zap, 
  Bot, 
  Send, 
  Loader2, 
  Sparkles, 
  CheckCircle2, 
  ChevronRight, 
  LayoutList, 
  Terminal, 
  History,
  Target,
  Rocket,
  ArrowRight,
  PlusCircle,
  BrainCircuit,
  Command,
  Lock,
  MessageSquare
} from "lucide-react";
import { generatePersonalizedRoadmap } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";
import { aiMentorStrategicAdvice } from "@/ai/flows/ai-mentor-strategic-advice-flow";
import { generateMentorContent } from "@/ai/flows/ai-mentor-content-gen-flow";
import { UpgradeModal } from "@/components/premium/UpgradeModal";

type Message = {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'roadmap' | 'advice' | 'content';
  data?: any;
};

export default function MentorPage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "System Initialized. I am your Legacy Hub Intelligence Agent. How can I accelerate your digital empire today?",
      type: 'text'
    }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleAction = async (action: 'roadmap' | 'advice' | 'content') => {
    if (!input) return;

    // Simulate Premium Check for Strategic Advice
    if (action === 'advice') {
      setShowUpgrade(true);
      return;
    }

    setIsLoading(true);
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput("");

    try {
      if (action === 'roadmap') {
        const res = await generatePersonalizedRoadmap({ businessGoals: currentInput });
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Strategic Roadmap Synchronized: ${res.roadmapTitle}`, 
          type: 'roadmap', 
          data: res 
        }]);
      } else if (action === 'content') {
        const res = await generateMentorContent({
          contentType: 'ad_copy',
          businessContext: currentInput,
          targetAudience: "Digital Entrepreneurs"
        });
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Content generated with high-conversion logic.", 
          type: 'content', 
          data: res 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Connection to Intelligence Layer interrupted." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-700">
        <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />
        
        {/* Left Sidebar - Strategy Memory */}
        <div className="hidden lg:flex w-72 flex-col gap-6">
          <GlassCard className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Strategy History
              </h3>
              <PlusCircle className="w-4 h-4 text-primary cursor-pointer hover:scale-110 transition-transform" />
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-4">
                {[
                  { title: "LinkedIn Funnel Plan", locked: false },
                  { title: "SaaS Growth Roadmap", locked: false },
                  { title: "Market Exit Analysis", locked: true },
                  { title: "Competitor Intel V3", locked: true }
                ].map((item, i) => (
                  <div key={i} onClick={() => item.locked && setShowUpgrade(true)} className={`p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group flex items-center justify-between ${item.locked ? 'opacity-50' : ''}`}>
                    <div>
                      <p className="text-[11px] font-medium group-hover:text-primary transition-colors">{item.title}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">Founders Hub</p>
                    </div>
                    {item.locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </GlassCard>

          <GlassCard className="p-4 bg-primary/5 border-primary/20 relative group cursor-pointer" onClick={() => setShowUpgrade(true)}>
             <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
               <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Upgrade for Logic V3</span>
             </div>
             <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">Unlock advanced competitor modeling and financial forecasting.</p>
             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <Zap className="w-3 h-3 text-primary" />
             </div>
          </GlassCard>
        </div>

        {/* Main Terminal Area */}
        <div className="flex-1 flex flex-col gap-6 relative">
          
          <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center blue-glow">
                  <Terminal className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold font-headline">Strategy Terminal</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Legacy Hub AI Layer v2.5</p>
                </div>
             </div>
             <div className="flex gap-2">
                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 text-[10px] font-bold">GEMINI 2.5</Badge>
                <Badge 
                  onClick={() => setShowUpgrade(true)}
                  className="bg-accent/10 border-accent/20 text-accent text-[10px] font-bold cursor-pointer hover:bg-accent/20 transition-all"
                >
                  <Zap className="w-3 h-3 mr-1 fill-accent" /> PRO LOGIC
                </Badge>
             </div>
          </div>

          <GlassCard className="flex-1 p-0 overflow-hidden flex flex-col border-white/5 bg-black/20">
            <ScrollArea className="flex-1 p-6">
              <div className="flex flex-col gap-8 max-w-4xl mx-auto">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                    <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 blue-glow">
                          <Bot className="w-6 h-6 text-white" />
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        <div className={`p-4 rounded-2xl ${
                          msg.role === 'user' 
                          ? 'bg-primary text-white blue-glow ml-auto' 
                          : 'bg-white/5 border border-white/10 text-white/90 shadow-xl'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        
                        {msg.type === 'roadmap' && msg.data && (
                          <div className="space-y-4 mt-2">
                            {msg.data.steps.map((step: any, idx: number) => (
                              <GlassCard key={idx} className="p-4 bg-white/5 border-primary/20 hover:border-primary/50 transition-all">
                                <h4 className="font-bold text-primary flex items-center gap-2">
                                  <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                                  {step.title}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{step.description}</p>
                              </GlassCard>
                            ))}
                          </div>
                        )}

                        {msg.type === 'content' && msg.data && (
                          <GlassCard className="mt-2 p-6 bg-purple-500/5 border-purple-500/20 shadow-lg">
                             <h4 className="font-bold text-purple-400 mb-3 flex items-center gap-2 text-sm uppercase tracking-widest">
                               <Sparkles className="w-4 h-4" /> Generated Logic
                             </h4>
                             <div className="p-5 rounded-2xl bg-black/40 border border-white/5 font-mono text-xs text-purple-100 mb-4 whitespace-pre-wrap leading-relaxed">
                               {msg.data.generatedContent}
                             </div>
                             <div className="flex flex-wrap gap-2">
                                {msg.data.strategicTips.map((tip: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] uppercase tracking-wider py-1 px-3 border-purple-500/20 text-purple-300">
                                    {tip}
                                  </Badge>
                                ))}
                             </div>
                          </GlassCard>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start animate-pulse">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                      </div>
                      <div className="h-10 w-32 bg-white/5 rounded-2xl border border-white/5" />
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="p-6 border-t border-white/5 bg-white/[0.02]">
              <div className="max-w-4xl mx-auto flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative group">
                    <Input 
                      placeholder="Enter business objectives..."
                      className="h-14 bg-white/5 border-white/10 rounded-2xl pl-12 pr-4 focus:ring-primary focus:border-primary/50 text-base"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Command className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  </div>
                  <Button 
                    onClick={() => handleAction('content')}
                    disabled={isLoading || !input}
                    className="h-14 w-14 rounded-2xl bg-primary hover:bg-primary/90 blue-glow shrink-0 transition-all active:scale-95"
                  >
                    <Send className="w-6 h-6" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mr-2">Engine Modules:</span>
                  <button 
                    onClick={() => handleAction('roadmap')}
                    disabled={isLoading || !input}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-primary disabled:opacity-50"
                  >
                    <LayoutList className="w-3.5 h-3.5" /> Basic Roadmap
                  </button>
                  <button 
                    onClick={() => handleAction('advice')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all text-[10px] font-bold uppercase tracking-widest text-primary"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" /> Strategic Audit <Lock className="w-2.5 h-2.5 ml-1" />
                  </button>
                  <button 
                    onClick={() => handleAction('content')}
                    disabled={isLoading || !input}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-purple-400/50 hover:bg-purple-400/10 transition-all text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-purple-400 disabled:opacity-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Content Engine
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right Sidebar - Active Intelligence */}
        <div className="hidden lg:flex w-80 flex-col gap-6">
          <GlassCard className="p-8 flex flex-col items-center text-center gap-6 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
             <div className="ai-orb flex items-center justify-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center">
                   <Bot className="w-8 h-8 text-white animate-pulse" />
                </div>
             </div>
             <div>
                <h3 className="text-xl font-bold font-headline">Intelligence Tier</h3>
                <Badge variant="outline" className="mt-3 border-white/10 text-muted-foreground uppercase font-bold text-[9px] tracking-widest">Standard Layer</Badge>
                <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed">You are currently using the Standard Intelligence Layer. Pro users get 40% faster generation and advanced logic models.</p>
             </div>
             <Button onClick={() => setShowUpgrade(true)} className="w-full bg-white text-black hover:bg-white/90 font-bold rounded-xl h-11 text-xs">
                Unlock Pro Intelligence
             </Button>
          </GlassCard>

          <GlassCard className="p-6 flex flex-col gap-4">
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Target className="w-4 h-4 text-primary" /> Premium Tactics
             </h4>
             <div className="space-y-3 opacity-60">
                {[
                  { label: "Exit Strategy Builder", icon: <Rocket className="w-3 h-3" /> },
                  { label: "Viral Matrix Logic", icon: <Zap className="w-3 h-3" /> },
                  { label: "VC Pitch Architect", icon: <Sparkles className="w-3 h-3" /> }
                ].map((play, i) => (
                  <button key={i} onClick={() => setShowUpgrade(true)} className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/50 transition-all group">
                    <span className="text-[10px] font-bold uppercase flex items-center gap-2">
                      {play.icon} {play.label}
                    </span>
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
             </div>
          </GlassCard>
        </div>

      </div>
    </AppLayout>
  );
}

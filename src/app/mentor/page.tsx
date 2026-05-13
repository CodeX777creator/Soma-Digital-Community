"use client";

import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  MessageSquare, 
  Terminal, 
  History,
  Target,
  Rocket,
  ArrowRight,
  PlusCircle,
  BrainCircuit,
  Command
} from "lucide-react";
import { generatePersonalizedRoadmap, PersonalizedRoadmapOutput } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";
import { aiMentorStrategicAdvice, AIMentorStrategicAdviceOutput } from "@/ai/flows/ai-mentor-strategic-advice-flow";
import { generateMentorContent, ContentGenOutput } from "@/ai/flows/ai-mentor-content-gen-flow";

type Message = {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'roadmap' | 'advice' | 'content';
  data?: any;
};

export default function MentorPage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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
      } else if (action === 'advice') {
        const res = await aiMentorStrategicAdvice({
          topic: "Strategic Scaling",
          businessDescription: currentInput,
          userGoals: "Market Dominance",
          currentChallenges: "Growth Plateaus"
        });
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Strategic analysis complete. Detailed insights provided below.", 
          type: 'advice', 
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
        
        {/* Left Sidebar - Strategy Memory */}
        <div className="hidden lg:flex w-72 flex-col gap-6">
          <GlassCard className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <History className="w-4 h-4" /> Strategy History
              </h3>
              <PlusCircle className="w-4 h-4 text-primary cursor-pointer hover:scale-110 transition-transform" />
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-4">
                {[
                  "LinkedIn Funnel Plan",
                  "SaaS Growth Roadmap",
                  "Email Series Analysis",
                  "Market Exit Strategy"
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group">
                    <p className="text-xs font-medium group-hover:text-primary transition-colors">{item}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">2h ago</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </GlassCard>

          <GlassCard className="p-4 bg-primary/5 border-primary/20">
             <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Intelligence Active</span>
             </div>
             <p className="text-[10px] text-muted-foreground mt-2">Personalized using alex_founder profile context.</p>
          </GlassCard>
        </div>

        {/* Main Terminal Area */}
        <div className="flex-1 flex flex-col gap-6 relative">
          
          {/* Header */}
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
                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">Gemini 2.5 Flash</Badge>
                <Badge variant="outline" className="border-accent/20 text-accent bg-accent/5">Low Latency</Badge>
             </div>
          </div>

          {/* Messages Window */}
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
                        
                        {/* Dynamic Content Blocks */}
                        {msg.type === 'roadmap' && msg.data && (
                          <div className="space-y-4 mt-2">
                            {msg.data.steps.map((step: any, idx: number) => (
                              <GlassCard key={idx} className="p-4 bg-white/5 border-primary/20 hover:border-primary/50 transition-all">
                                <h4 className="font-bold text-primary flex items-center gap-2">
                                  <span className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px]">{idx + 1}</span>
                                  {step.title}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{step.description}</p>
                              </GlassCard>
                            ))}
                          </div>
                        )}

                        {msg.type === 'advice' && msg.data && (
                          <GlassCard className="mt-2 p-6 bg-accent/5 border-accent/20">
                            <h4 className="font-bold text-accent mb-2">Strategic Analysis</h4>
                            <p className="text-xs text-muted-foreground italic mb-4">"{msg.data.strategicAdvice}"</p>
                            <div className="space-y-2">
                              {msg.data.actionableSteps.map((step: string, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 text-[10px] text-white/80">
                                  <CheckCircle2 className="w-3 h-3 text-accent" /> {step}
                                </div>
                              ))}
                            </div>
                          </GlassCard>
                        )}

                        {msg.type === 'content' && msg.data && (
                          <GlassCard className="mt-2 p-6 bg-purple-500/5 border-purple-500/20">
                             <h4 className="font-bold text-purple-400 mb-2 flex items-center gap-2">
                               <Sparkles className="w-4 h-4" /> Generated Copy
                             </h4>
                             <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-xs text-purple-100 mb-4 whitespace-pre-wrap">
                               {msg.data.generatedContent}
                             </div>
                             <div className="flex flex-wrap gap-2">
                                {msg.data.strategicTips.map((tip: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-[8px] uppercase tracking-tighter py-0">{tip}</Badge>
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

            {/* Input Terminal */}
            <div className="p-6 border-t border-white/5 bg-white/[0.02]">
              <div className="max-w-4xl mx-auto flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative group">
                    <Input 
                      placeholder="Enter business objectives or scaling challenges..."
                      className="h-14 bg-white/5 border-white/10 rounded-2xl pl-12 pr-4 focus:ring-primary focus:border-primary/50 text-base"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAction('advice')}
                    />
                    <Command className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  </div>
                  <Button 
                    onClick={() => handleAction('advice')}
                    disabled={isLoading || !input}
                    className="h-14 w-14 rounded-2xl bg-primary hover:bg-primary/90 blue-glow shrink-0"
                  >
                    <Send className="w-6 h-6" />
                  </Button>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-2">Engine Controls:</span>
                  <button 
                    onClick={() => handleAction('roadmap')}
                    disabled={isLoading || !input}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-xs font-bold text-white/70 hover:text-primary disabled:opacity-50"
                  >
                    <LayoutList className="w-3.5 h-3.5" /> Generate Roadmap
                  </button>
                  <button 
                    onClick={() => handleAction('content')}
                    disabled={isLoading || !input}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-purple-400/50 hover:bg-purple-400/10 transition-all text-xs font-bold text-white/70 hover:text-purple-400 disabled:opacity-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Content Shortcuts
                  </button>
                  <button 
                    onClick={() => handleAction('advice')}
                    disabled={isLoading || !input}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:border-accent/50 hover:bg-accent/10 transition-all text-xs font-bold text-white/70 hover:text-accent disabled:opacity-50"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" /> Strategic Audit
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
                <h3 className="text-xl font-bold font-headline">Legacy Intelligence</h3>
                <p className="text-xs text-muted-foreground mt-2 px-4">AI Mentor is analyzing your current business trajectory for bottlenecks.</p>
             </div>
             <div className="w-full h-px bg-white/10" />
             <div className="w-full space-y-4">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Current Focus</span>
                  <Badge className="bg-accent/20 text-accent border-accent/20">Scaling SaaS @ $10k MRR</Badge>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Next Milestone</span>
                  <p className="text-sm font-bold text-white">Market Validation Phase 2</p>
                </div>
             </div>
          </GlassCard>

          <GlassCard className="p-6 flex flex-col gap-4">
             <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Target className="w-4 h-4 text-primary" /> Tactical Plays
             </h4>
             <div className="space-y-3">
                {[
                  { label: "LinkedIn Automation", icon: <Rocket className="w-3 h-3" /> },
                  { label: "High-Ticket Closer Flow", icon: <Zap className="w-3 h-3" /> },
                  { label: "Content Matrix v4", icon: <Sparkles className="w-3 h-3" /> }
                ].map((play, i) => (
                  <button key={i} className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/50 transition-all group">
                    <span className="text-xs font-medium flex items-center gap-2">
                      {play.icon} {play.label}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
             </div>
          </GlassCard>
        </div>

      </div>
    </AppLayout>
  );
}
"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  TrendingUp, 
  Users, 
  Target, 
  Trophy, 
  Flame, 
  Bot, 
  CheckCircle2, 
  Video, 
  MessageSquare, 
  ChevronRight, 
  Layers, 
  Sparkles,
  Search,
  Bell,
  Clock,
  Quote,
  Lock
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartTooltip, 
  ResponsiveContainer 
} from "recharts";
import { useState, useEffect } from "react";
import { PremiumLock } from "@/components/premium/PremiumLock";
import { UpgradeModal } from "@/components/premium/UpgradeModal";

const performanceData = [
  { name: 'Mon', xp: 400 },
  { name: 'Tue', xp: 300 },
  { name: 'Wed', xp: 600 },
  { name: 'Thu', xp: 800 },
  { name: 'Fri', xp: 500 },
  { name: 'Sat', xp: 900 },
  { name: 'Sun', xp: 700 },
];

const leaders = [
  { id: 1, name: "Marcus T.", xp: "42,120", avatar: "https://picsum.photos/seed/l1/100/100" },
  { id: 2, name: "Sarah C.", xp: "38,450", avatar: "https://picsum.photos/seed/l2/100/100" },
  { id: 3, name: "Elena R.", xp: "35,900", avatar: "https://picsum.photos/seed/l3/100/100" },
];

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AppLayout>
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />
      <div className="flex flex-col gap-8 animate-in fade-in duration-700">
        
        {/* Top Intelligence Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl border-2 border-primary/50 p-1 blue-glow overflow-hidden">
                <img src="https://picsum.photos/seed/user12/100/100" alt="Avatar" className="w-full h-full object-cover rounded-xl" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-accent rounded-full border-2 border-background flex items-center justify-center cyan-glow">
                <span className="text-[10px] font-bold text-black">12</span>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold font-headline tracking-tight">System Active: Alex</h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge className="bg-white/5 text-muted-foreground border-white/10 text-[9px] font-bold px-3 py-0.5 uppercase tracking-widest">Explorer Tier</Badge>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-bold uppercase tracking-wider">
                  <Clock className="w-3 h-3" /> Online for 2h
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 md:gap-8">
            <Button onClick={() => setShowUpgrade(true)} className="bg-primary hover:bg-primary/90 rounded-xl h-12 px-6 font-bold blue-glow transition-all active:scale-95 text-xs">
              <Zap className="w-4 h-4 mr-2 fill-white" /> Upgrade for Pro Stats
            </Button>
            <div className="h-10 w-px bg-white/5 hidden md:block" />
            <Button size="icon" variant="ghost" className="rounded-full bg-white/5 relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background" />
            </Button>
          </div>
        </div>

        {/* Primary Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <GlassCard className="p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" /> Leaderboard
                </h3>
                <ChevronRight className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-white" />
              </div>
              <div className="space-y-4">
                {leaders.map((leader, i) => (
                  <div key={leader.id} className="flex items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-3">{i + 1}</span>
                      <img src={leader.avatar} className="w-8 h-8 rounded-full border border-white/10" alt={leader.name} />
                      <span className="text-[11px] font-bold group-hover:text-primary transition-colors">{leader.name}</span>
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground">{leader.xp} XP</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col gap-4">
              <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-accent">
                <Layers className="w-4 h-4" /> Power Tools
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Target className="w-4 h-4" />, label: "Strategy" },
                  { icon: <Zap className="w-4 h-4" />, label: "Autopilot", locked: true },
                  { icon: <Users className="w-4 h-4" />, label: "Network" },
                  { icon: <Search className="w-4 h-4" />, label: "Insight", locked: true }
                ].map((tool, i) => (
                  <button 
                    key={i} 
                    onClick={() => tool.locked && setShowUpgrade(true)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/5 hover:border-accent/50 hover:bg-accent/5 transition-all group relative ${tool.locked ? 'opacity-50' : ''}`}
                  >
                    <div className="text-muted-foreground group-hover:text-accent mb-1 transition-colors">{tool.icon}</div>
                    <span className="text-[9px] font-bold uppercase tracking-tight">{tool.label}</span>
                    {tool.locked && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 text-muted-foreground" />}
                  </button>
                ))}
              </div>
            </GlassCard>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/20 to-transparent border border-purple-500/20 relative overflow-hidden group">
              <Quote className="absolute top-2 right-2 w-12 h-12 text-purple-500/10 -rotate-12 group-hover:scale-110 transition-transform" />
              <p className="text-sm italic text-purple-200 leading-relaxed mb-4 relative z-10">
                "The distance between your reality and your digital empire is simply the depth of your focus."
              </p>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-6 bg-purple-500/50" />
                <span className="text-[10px] font-bold uppercase text-purple-400">Hub Logic Engine</span>
              </div>
            </div>
          </div>

          {/* Center Column */}
          <div className="lg:col-span-6 flex flex-col gap-8">
            <GlassCard className="p-0 overflow-hidden flex flex-col min-h-[400px]">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold font-headline flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> Performance Analytics
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Standard Activity View</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-white/10 hover:bg-white/5 cursor-pointer text-[9px] font-bold uppercase">Activity XP</Badge>
                  <Badge onClick={() => setShowUpgrade(true)} variant="outline" className="border-accent/20 text-accent bg-accent/5 cursor-pointer text-[9px] font-bold uppercase">Unlock Reach Insights <Lock className="w-2 h-2 ml-1" /></Badge>
                </div>
              </div>
              <div className="p-6 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1A66FF" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#1A66FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis dataKey="name" stroke="#ffffff33" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff33" fontSize={10} tickLine={false} axisLine={false} />
                    <Area type="monotone" dataKey="xp" stroke="#1A66FF" fillOpacity={1} fill="url(#colorXp)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="p-4 bg-white/5 border-t border-white/5 flex justify-around">
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">XP PEAK</p>
                  <p className="text-sm font-bold">900/day</p>
                </div>
                <div className="text-center opacity-40">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">REACH <Lock className="inline w-2 h-2" /></p>
                  <p className="text-sm font-bold">Locked</p>
                </div>
                <div className="text-center opacity-40">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">CONV % <Lock className="inline w-2 h-2" /></p>
                  <p className="text-sm font-bold text-green-400">Locked</p>
                </div>
              </div>
            </GlassCard>

            <div className="rounded-[2.5rem] bg-[#020617] border border-primary/30 p-8 relative overflow-hidden group shadow-[0_0_50px_-12px_rgba(26,102,255,0.2)]">
              <div className="flex items-start gap-6 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center blue-glow shrink-0 animate-pulse">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xl font-bold font-headline flex items-center gap-2">
                      Legacy Mentor <Badge className="bg-white/5 text-muted-foreground border-white/10 uppercase tracking-widest text-[8px]">Basic</Badge>
                    </h4>
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                  </div>
                  <p className="text-sm text-blue-100/80 leading-relaxed italic">
                    "Alex, you've maintained a 5-day streak. Your trajectory is positive, but your scaling logic is operating on a Standard model. Upgrade to Pro for high-velocity market audits."
                  </p>
                  <div className="flex gap-4 mt-2">
                    <button onClick={() => setShowUpgrade(true)} className="text-[10px] font-bold text-primary flex items-center gap-1 uppercase tracking-widest hover:underline">
                      Apply Pro Logic Patch <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <GlassCard className="p-6 flex flex-col items-center gap-4 text-center bg-gradient-to-b from-accent/5 to-transparent border-t-2 border-t-accent">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center cyan-glow border-2 border-accent/20">
                  <Flame className="w-10 h-10 text-accent animate-bounce" />
                </div>
                <div className="absolute -top-2 -right-2 bg-background border border-accent/30 rounded-full px-2 py-0.5 text-[10px] font-bold text-accent">
                  HOT
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold font-headline uppercase">05 DAYS</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Active Streak</p>
              </div>
              <div className="flex gap-2 w-full">
                {[1, 1, 1, 1, 1, 0, 0].map((active, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${active ? 'bg-accent cyan-glow' : 'bg-white/5'}`} />
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Daily Missions
                </h3>
              </div>
              <div className="space-y-3">
                {[
                  { title: "Review Q3 Strategy", xp: "+50", done: false },
                  { title: "Network with 2 founders", xp: "+30", done: true },
                  { title: "Market Shift Audit", xp: "+100", done: false, locked: true }
                ].map((mission, i) => (
                  <div 
                    key={i} 
                    onClick={() => mission.locked && setShowUpgrade(true)}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${mission.locked ? 'opacity-40 border-dashed' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${mission.done ? 'bg-green-500 border-green-500' : 'border-white/20'}`}>
                        {mission.done && <CheckCircle2 className="w-3 h-3 text-black" />}
                      </div>
                      <span className={`text-[11px] font-bold ${mission.done ? 'line-through text-muted-foreground' : 'text-white'}`}>{mission.title}</span>
                    </div>
                    {mission.locked ? <Lock className="w-3 h-3" /> : <Badge variant="ghost" className="text-[9px] text-accent font-bold">{mission.xp} XP</Badge>}
                  </div>
                ))}
              </div>
            </GlassCard>

            <PremiumLock feature="Elite Live Sessions" description="Join TONIGHT @ 8PM for an exclusive session with 8-figure founders. Locked for Explorer tier.">
              <GlassCard className="p-5 flex flex-col gap-4 border-l-4 border-l-primary">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <Video className="w-4 h-4 text-primary" /> Live Sessions
                </h3>
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold text-primary mb-1">TONIGHT @ 8PM</p>
                  <p className="text-sm font-bold">Scaling Masterclass</p>
                </div>
              </GlassCard>
            </PremiumLock>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

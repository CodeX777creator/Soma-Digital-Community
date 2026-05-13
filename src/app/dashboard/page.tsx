"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, Users, Target, Calendar, Trophy, ArrowUpRight } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

const performanceData = [
  { name: 'Mon', xp: 400 },
  { name: 'Tue', xp: 300 },
  { name: 'Wed', xp: 600 },
  { name: 'Thu', xp: 800 },
  { name: 'Fri', xp: 500 },
  { name: 'Sat', xp: 900 },
  { name: 'Sun', xp: 700 },
];

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold font-headline tracking-tight">Welcome back, Alex.</h1>
            <p className="text-muted-foreground mt-1">You're on a 5-day streak. Keep it up!</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 py-1 px-3">
              <Trophy className="w-3 h-3 mr-1" /> Premium Member
            </Badge>
            <Badge variant="outline" className="border-accent/30 text-accent bg-accent/5 py-1 px-3">
              Elite Rank #42
            </Badge>
          </div>
        </div>

        {/* Top Grid - Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <GlassCard className="flex flex-col gap-2 p-5 border-l-4 border-l-primary">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total XP Earned</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline tracking-tighter">14,290</span>
              <span className="text-xs text-green-400 font-bold flex items-center">
                <ArrowUpRight className="w-3 h-3" /> +12%
              </span>
            </div>
            <Progress value={75} className="h-1 bg-white/5 mt-2" />
            <span className="text-[10px] text-muted-foreground">3,200 XP until next level</span>
          </GlassCard>

          <GlassCard className="flex flex-col gap-2 p-5 border-l-4 border-l-accent">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Streak</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline tracking-tighter">05 Days</span>
              <span className="text-xs text-primary font-bold">Personal Best: 14</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[1, 1, 1, 1, 1, 0, 0].map((active, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${active ? 'bg-accent cyan-glow' : 'bg-white/5'}`} />
              ))}
            </div>
          </GlassCard>

          <GlassCard className="flex flex-col gap-2 p-5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Community Reach</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline tracking-tighter">8.4K</span>
              <span className="text-xs text-green-400 font-bold">+4%</span>
            </div>
            <Users className="w-5 h-5 text-muted-foreground opacity-50 absolute top-5 right-5" />
          </GlassCard>

          <GlassCard className="flex flex-col gap-2 p-5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Resource Access</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-headline tracking-tighter">12/40</span>
              <span className="text-xs text-primary font-bold">Vault Unlocked</span>
            </div>
            <Target className="w-5 h-5 text-muted-foreground opacity-50 absolute top-5 right-5" />
          </GlassCard>
        </div>

        {/* Main Section - Chart & Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <GlassCard className="lg:col-span-2 p-0 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-bold font-headline flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" /> Performance Analytics
              </h3>
              <Calendar className="w-5 h-5 text-muted-foreground hover:text-white cursor-pointer" />
            </div>
            <div className="p-6 h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A66FF" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#1A66FF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#ffffff33" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#ffffff33" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `${value}`} 
                  />
                  <RechartTooltip 
                    contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #ffffff10', borderRadius: '8px' }}
                    itemStyle={{ color: '#1A66FF' }}
                  />
                  <Area type="monotone" dataKey="xp" stroke="#1A66FF" fillOpacity={1} fill="url(#colorXp)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="flex flex-col gap-6">
            <GlassCard className="p-6 border-t-2 border-t-accent">
               <div className="flex items-center justify-between mb-4">
                 <h4 className="font-bold text-lg font-headline">Upcoming Tasks</h4>
                 <Zap className="w-4 h-4 text-accent animate-pulse" />
               </div>
               <div className="space-y-4">
                 <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                   <div className="w-5 h-5 mt-0.5 rounded border border-white/20 flex items-center justify-center group-hover:border-primary transition-colors" />
                   <div>
                     <p className="text-sm font-semibold">Review Q3 Funnel Strategy</p>
                     <p className="text-[10px] text-muted-foreground mt-1">Due in 2 hours • +50 XP</p>
                   </div>
                 </div>
                 <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                   <div className="w-5 h-5 mt-0.5 rounded border border-white/20 flex items-center justify-center group-hover:border-primary transition-colors" />
                   <div>
                     <p className="text-sm font-semibold">Update Creator Media Kit</p>
                     <p className="text-[10px] text-muted-foreground mt-1">Due tomorrow • +30 XP</p>
                   </div>
                 </div>
               </div>
            </GlassCard>

            <GlassCard className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
               <h4 className="font-bold text-lg font-headline mb-2">AI Mentor Insight</h4>
               <p className="text-sm text-muted-foreground leading-relaxed italic">
                 "Your engagement in the 'Marketing Funnels' sub-community is up 40%. Consider launching your lead magnet today to capitalize on the momentum."
               </p>
               <button className="text-primary text-xs font-bold mt-4 flex items-center gap-1 hover:underline">
                 Ask for strategy <ArrowUpRight className="w-3 h-3" />
               </button>
            </GlassCard>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

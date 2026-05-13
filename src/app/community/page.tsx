"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { 
  MessageSquare, 
  Heart, 
  Share2, 
  MoreHorizontal, 
  Image as ImageIcon, 
  Video, 
  Link as LinkIcon, 
  Users, 
  Hash, 
  TrendingUp, 
  Sparkles, 
  Trophy, 
  Zap, 
  Search,
  Pin,
  Flame,
  Star,
  ShieldCheck,
  ChevronRight
} from "lucide-react";

const posts = [
  {
    id: 1,
    isPinned: true,
    type: "announcement",
    user: { name: "Legacy AI", role: "Intelligence Layer", avatar: "https://picsum.photos/seed/ai-avatar/100/100", rank: "SYSTEM" },
    content: "Intelligence Update v2.5: The Vault has been expanded with 12 new high-converting funnel templates for SaaS. AI Mentors are now processing market shifts 40% faster.",
    likes: 1240,
    comments: 0,
    time: "Global Update",
    tags: ["#System", "#Update"],
  },
  {
    id: 2,
    type: "win",
    user: { name: "Sarah Chen", role: "Growth Marketer", avatar: "https://picsum.photos/seed/user1/100/100", rank: "Elite" },
    content: "Just hit 10k MRR with my new SaaS funnel! The AI Mentor's advice on localized LinkedIn ads was a total game-changer. Sharing the template in the marketplace later today. 🚀",
    likes: 124,
    comments: 32,
    time: "2h ago",
    tags: ["#SaaS", "#Growth", "#Scaling"],
    image: "https://picsum.photos/seed/post1/800/400"
  },
  {
    id: 3,
    type: "mentorship",
    user: { name: "Marcus Thorne", role: "Venture Capital", avatar: "https://picsum.photos/seed/user2/100/100", rank: "Legend" },
    content: "Looking to invest in 3 AI-native agencies this quarter. If you've got a solid roadmap and early traction, let's talk. Legacy Hub members get priority review.",
    likes: 89,
    comments: 54,
    time: "4h ago",
    tags: ["#Investment", "#AI", "#Agencies"],
  },
  {
    id: 4,
    type: "insight",
    user: { name: "Elena Rodriguez", role: "Brand Strategist", avatar: "https://picsum.photos/seed/user3/100/100", rank: "Pro" },
    content: "Current aesthetic trend for luxury tech platforms: deep obsidian backgrounds with subtle electric blue glows. It's about feeling futuristic but grounded. Thoughts?",
    likes: 45,
    comments: 12,
    time: "6h ago",
    tags: ["#Design", "#Branding", "#Trends"],
  }
];

export default function CommunityPage() {
  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-1000">
        
        {/* Left Sidebar - Navigation */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24 h-fit">
          <GlassCard className="p-4 flex flex-col gap-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] px-2 mb-4">Ecosystem Channels</h4>
            <Button variant="ghost" className="justify-start gap-3 bg-white/5 border-white/5 text-white h-11 rounded-xl">
              <Users className="w-4 h-4 text-primary" /> Global Intelligence
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5 h-11 rounded-xl">
              <Trophy className="w-4 h-4 text-yellow-500" /> Success Stories
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5 h-11 rounded-xl">
              <Sparkles className="w-4 h-4 text-accent" /> AI Masterminds
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5 h-11 rounded-xl">
              <MessageSquare className="w-4 h-4 text-purple-400" /> Support Hub
            </Button>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col gap-5">
             <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Market Trends</h4>
             <div className="flex flex-wrap gap-2">
               {["#AI", "#SaaS", "#Funnel", "#Web3", "#Design", "#Growth"].map(tag => (
                 <Badge key={tag} variant="outline" className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-all py-1.5 px-3 border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                   {tag}
                 </Badge>
               ))}
             </div>
          </GlassCard>

          <GlassCard className="p-0 overflow-hidden relative group cursor-pointer border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
            <div className="p-6">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center blue-glow mb-4">
                <Star className="w-5 h-5 text-white" />
              </div>
              <h4 className="font-bold text-sm mb-1">Elite Networking</h4>
              <p className="text-[10px] text-muted-foreground">Unlock access to high-fidelity member circles.</p>
            </div>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="w-4 h-4 text-primary" />
            </div>
          </GlassCard>
        </div>

        {/* Main Feed */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          
          {/* AI Intelligence Summary Widget */}
          <div className="rounded-[2rem] bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 p-[1px] blue-glow animate-pulse-glow">
            <GlassCard className="rounded-[2rem] bg-card/90 border-none p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-primary">AI Intelligence Summary</h3>
                  <p className="text-[10px] text-muted-foreground">Aggregated success data from the last 24h</p>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed italic">
                "The community is seeing a 14% increase in conversion rates using the new 'Obsidian' branding kit. Notable activity in #SaaS scaling. 3 major wins reported in the last 4 hours."
              </p>
            </GlassCard>
          </div>

          {/* Create Post */}
          <GlassCard className="p-4 border-t-2 border-t-primary/30 rounded-3xl">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full border border-primary/20 p-0.5 shrink-0 blue-glow">
                <img src="https://picsum.photos/seed/me/100/100" alt="Me" className="w-full h-full rounded-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <textarea 
                  placeholder="Share a breakthrough or ask the Intelligence Layer..."
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-base placeholder:text-muted-foreground pt-1 no-scrollbar"
                  rows={2}
                />
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5">
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl text-muted-foreground hover:text-accent hover:bg-accent/5">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl text-muted-foreground hover:text-purple-400 hover:bg-purple-400/5">
                      <LinkIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button className="bg-primary hover:bg-primary/90 rounded-full h-9 px-6 font-bold text-xs blue-glow transition-all active:scale-95">Post Insight</Button>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Posts Feed */}
          <div className="space-y-6">
            {posts.map(post => (
              <GlassCard 
                key={post.id} 
                className={cn(
                  "p-6 rounded-3xl transition-all hover:translate-y-[-2px] hover:border-white/10",
                  post.isPinned && "border-primary/40 bg-primary/[0.03]"
                )}
              >
                {post.isPinned && (
                  <div className="flex items-center gap-2 mb-4 text-[10px] font-bold text-primary uppercase tracking-widest">
                    <Pin className="w-3 h-3 fill-primary" /> Pinned intelligence
                  </div>
                )}
                
                <div className="flex items-start justify-between mb-5">
                  <div className="flex gap-3">
                    <div className="relative">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl border p-0.5 shrink-0",
                        post.type === 'announcement' ? "border-primary blue-glow" : "border-white/10"
                      )}>
                        <img src={post.user.avatar} alt={post.user.name} className="w-full h-full rounded-[14px] object-cover" />
                      </div>
                      {post.type === 'win' && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-background shadow-lg">
                          <Trophy className="w-3 h-3 text-black" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white hover:text-primary cursor-pointer transition-colors">{post.user.name}</h4>
                        <Badge variant="secondary" className={cn(
                          "text-[9px] uppercase font-bold py-0 px-2 rounded-md",
                          post.user.rank === 'SYSTEM' ? "bg-primary text-white" : "bg-white/5 text-muted-foreground"
                        )}>
                          {post.user.rank}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{post.user.role} • {post.time}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8 hover:bg-white/5 rounded-full">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4 mb-6">
                  <p className={cn(
                    "text-white/90 leading-relaxed",
                    post.type === 'announcement' ? "text-lg font-medium" : "text-base"
                  )}>
                    {post.content}
                  </p>

                  {post.image && (
                    <div className="rounded-[2rem] overflow-hidden border border-white/5 relative group cursor-zoom-in">
                      <img src={post.image} alt="Post media" className="w-full aspect-video object-cover transition-transform duration-1000 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                        <p className="text-xs font-medium text-white/70">Click to expand vision</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-bold text-primary/70 hover:text-primary cursor-pointer transition-colors uppercase tracking-wider">{tag}</span>
                  ))}
                </div>

                <div className="flex items-center gap-6 pt-5 border-t border-white/5">
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-red-400 transition-all group">
                    <Heart className="w-5 h-5 transition-transform group-hover:scale-110 group-active:scale-90" />
                    <span className="text-xs font-bold">{post.likes > 1000 ? `${(post.likes/1000).toFixed(1)}k` : post.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-all group">
                    <MessageSquare className="w-5 h-5 transition-transform group-hover:scale-110" />
                    <span className="text-xs font-bold">{post.comments}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-all group">
                    <Share2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Analytics & Spotlight */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24 h-fit">
           
           <GlassCard className="p-6 flex flex-col gap-6">
             <div className="flex items-center justify-between">
               <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Member Spotlight</h4>
               <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
             </div>
             <div className="flex flex-col items-center text-center gap-3">
                <div className="w-20 h-20 rounded-3xl border-2 border-accent p-1 cyan-glow overflow-hidden mb-2">
                  <img src="https://picsum.photos/seed/spotlight/200/200" className="w-full h-full rounded-2xl object-cover" />
                </div>
                <div>
                  <h5 className="font-bold text-lg">Julian Rossi</h5>
                  <p className="text-[10px] text-accent font-bold uppercase tracking-widest mt-1">Vetted Founder</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed px-2">
                  "Scaled my SaaS from $0 to $12k MRR in 45 days using The Vault."
                </p>
                <Button variant="outline" className="w-full rounded-xl border-white/10 hover:bg-white/5 text-[10px] font-bold uppercase h-10 mt-2">
                  View Profile
                </Button>
             </div>
           </GlassCard>

           <GlassCard className="p-6">
             <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-6">Ecosystem Stats</h4>
             <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                    <span className="text-muted-foreground">Community XP Goal</span>
                    <span className="text-primary">82%</span>
                  </div>
                  <Progress value={82} className="h-1.5 bg-white/5" />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                   <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Active</p>
                      <p className="text-lg font-bold">1.4k</p>
                   </div>
                   <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">New Wins</p>
                      <p className="text-lg font-bold text-green-400">12</p>
                   </div>
                </div>
             </div>
           </GlassCard>

           <GlassCard className="p-6">
             <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">Trending Creators</h4>
             <div className="space-y-4">
               {[1, 2, 3].map(i => (
                 <div key={i} className="flex items-center justify-between group cursor-pointer">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                        <img src={`https://picsum.photos/seed/tr${i}/100/100`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                     </div>
                     <div>
                       <p className="text-xs font-bold text-white group-hover:text-primary transition-colors">Founder_{i}9</p>
                       <p className="text-[9px] text-muted-foreground uppercase font-medium">Rank {i}</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-1 text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-all">
                     View <ChevronRight className="w-3 h-3" />
                   </div>
                 </div>
               ))}
             </div>
           </GlassCard>

        </div>
      </div>
    </AppLayout>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

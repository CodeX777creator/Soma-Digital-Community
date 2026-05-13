"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Heart, Share2, MoreHorizontal, Image as ImageIcon, Video, Link as LinkIcon, Users, Hash, TrendingUp } from "lucide-react";

const posts = [
  {
    id: 1,
    user: { name: "Sarah Chen", role: "Growth Marketer", avatar: "https://picsum.photos/seed/user1/100/100", rank: "Elite" },
    content: "Just hit 10k MRR with my new SaaS funnel! The AI Mentor's advice on localized LinkedIn ads was a total game-changer. Sharing the template in the marketplace later today. 🚀",
    likes: 124,
    comments: 32,
    time: "2h ago",
    tags: ["#SaaS", "#Growth", "#Scaling"],
    image: "https://picsum.photos/seed/post1/800/400"
  },
  {
    id: 2,
    user: { name: "Marcus Thorne", role: "Venture Capital", avatar: "https://picsum.photos/seed/user2/100/100", rank: "Legend" },
    content: "Looking to invest in 3 AI-native agencies this quarter. If you've got a solid roadmap and early traction, let's talk. Legacy Hub members get priority review.",
    likes: 89,
    comments: 54,
    time: "4h ago",
    tags: ["#Investment", "#AI", "#Agencies"],
  },
  {
    id: 3,
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar - Navigation & Filters */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24">
          <GlassCard className="p-4 flex flex-col gap-2">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 mb-2">Channels</h4>
            <Button variant="ghost" className="justify-start gap-3 bg-white/5 border-white/5 text-white">
              <Users className="w-4 h-4 text-primary" /> Global Feed
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5">
              <TrendingUp className="w-4 h-4 text-accent" /> Trending
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5">
              <Zap className="w-4 h-4 text-yellow-500" /> Announcements
            </Button>
            <Button variant="ghost" className="justify-start gap-3 hover:bg-white/5">
              <MessageSquare className="w-4 h-4 text-purple-400" /> Masterminds
            </Button>
          </GlassCard>

          <GlassCard className="p-4 flex flex-col gap-4">
             <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Popular Tags</h4>
             <div className="flex flex-wrap gap-2">
               {["#AI", "#Scaling", "#Marketing", "#Funnel", "#Crypto", "#Lifestyle"].map(tag => (
                 <Badge key={tag} variant="outline" className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors py-1 px-3 border-white/10">
                   {tag}
                 </Badge>
               ))}
             </div>
          </GlassCard>
        </div>

        {/* Main Feed */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          {/* Create Post */}
          <GlassCard className="p-4 border-t-2 border-t-primary/50">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                <img src="https://picsum.photos/seed/me/100/100" alt="Me" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <textarea 
                  placeholder="Share an insight or ask for advice..."
                  className="w-full bg-transparent border-none resize-none focus:ring-0 text-lg placeholder:text-muted-foreground pt-1"
                  rows={2}
                />
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-primary">
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-accent">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-purple-400">
                      <LinkIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button className="bg-primary hover:bg-primary/90 rounded-full h-9 px-6 font-bold text-sm blue-glow">Post</Button>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Posts */}
          <div className="space-y-6">
            {posts.map(post => (
              <GlassCard key={post.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-full border border-primary/20 p-0.5 blue-glow shrink-0">
                      <img src={post.user.avatar} alt={post.user.name} className="w-full h-full rounded-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white hover:underline cursor-pointer">{post.user.name}</h4>
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold bg-primary/10 text-primary border-primary/20 py-0 px-2">{post.user.rank}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{post.user.role} • {post.time}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>

                <p className="text-white/90 leading-relaxed mb-4 text-lg">
                  {post.content}
                </p>

                {post.image && (
                  <div className="rounded-2xl overflow-hidden border border-white/5 mb-4 group relative">
                    <img src={post.image} alt="Post media" className="w-full aspect-video object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.map(tag => (
                    <span key={tag} className="text-xs font-semibold text-accent hover:underline cursor-pointer">{tag}</span>
                  ))}
                </div>

                <div className="flex items-center gap-6 pt-4 border-t border-white/5">
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-red-400 transition-colors group">
                    <Heart className="w-5 h-5 group-hover:fill-red-400/20" />
                    <span className="text-sm font-medium">{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group">
                    <MessageSquare className="w-5 h-5 group-hover:fill-primary/20" />
                    <span className="text-sm font-medium">{post.comments}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Trends & Suggestions */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24">
           <GlassCard className="p-6">
             <h4 className="font-bold font-headline mb-4 flex items-center gap-2">
               <Zap className="w-4 h-4 text-primary fill-primary" /> Active Challenges
             </h4>
             <div className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-xs font-bold text-primary uppercase mb-1">Weekly Challenge</p>
                  <p className="text-sm font-semibold">Post 5 strategic insights</p>
                  <Progress value={60} className="h-1 mt-2" />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">3/5 Complete</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 opacity-50">
                  <p className="text-xs font-bold text-accent uppercase mb-1">Referral Goal</p>
                  <p className="text-sm font-semibold">Invite 2 founders</p>
                  <Progress value={0} className="h-1 mt-2" />
                </div>
             </div>
           </GlassCard>

           <GlassCard className="p-6">
             <h4 className="font-bold font-headline mb-4">Trending Creators</h4>
             <div className="space-y-4">
               {[1, 2, 3].map(i => (
                 <div key={i} className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-full bg-muted">
                        <img src={`https://picsum.photos/seed/tr${i}/50/50`} className="rounded-full" />
                     </div>
                     <p className="text-sm font-medium">Founder_{i}9</p>
                   </div>
                   <Button variant="ghost" className="text-primary text-xs h-7 px-3 hover:bg-primary/10">Follow</Button>
                 </div>
               ))}
             </div>
           </GlassCard>
        </div>
      </div>
    </AppLayout>
  );
}

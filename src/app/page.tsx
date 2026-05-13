"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { 
  Zap, 
  Rocket, 
  Globe, 
  Shield, 
  Star, 
  ArrowRight, 
  Play, 
  Users, 
  TrendingUp, 
  Bot, 
  CheckCircle2, 
  ChevronRight,
  Target,
  Quote
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AppLayout>
      <div className="flex flex-col gap-32 pb-32">
        {/* Hero Section */}
        <section className="relative min-h-[85vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden pt-12">
          <div className="animate-reveal opacity-0" style={{ animationDelay: '0.1s' }}>
            <Badge variant="outline" className="mb-8 border-primary/30 text-primary bg-primary/5 py-1.5 px-4 rounded-full font-bold uppercase tracking-widest text-[10px] blue-glow">
              <Zap className="w-3.5 h-3.5 mr-2 fill-primary" />
              The Intelligence Layer for Founders
            </Badge>
          </div>
          
          <h1 className="text-6xl md:text-9xl font-bold font-headline leading-[0.95] mb-8 tracking-tighter animate-reveal opacity-0" style={{ animationDelay: '0.3s' }}>
            Build Your Digital <br />
            <span className="text-gradient">Empire With AI</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg md:text-2xl mb-12 leading-relaxed animate-reveal opacity-0" style={{ animationDelay: '0.5s' }}>
            Join a next-generation entrepreneurial community powered by 
            <span className="text-white font-medium"> AI mentorship</span>, 
            <span className="text-white font-medium"> automation</span>, and 
            <span className="text-white font-medium"> elite-level education</span>.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-reveal opacity-0" style={{ animationDelay: '0.7s' }}>
            <Link href="/onboarding">
              <Button className="h-16 px-10 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow group transition-all">
                Enter The Hub
                <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button variant="ghost" className="h-16 px-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xl font-semibold backdrop-blur-sm">
              <Play className="mr-3 fill-white w-5 h-5" />
              Watch Vision
            </Button>
          </div>

          {/* Member Stats Social Proof */}
          <div className="mt-20 flex flex-wrap justify-center gap-8 md:gap-16 opacity-60 animate-reveal opacity-0" style={{ animationDelay: '0.9s' }}>
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-bold font-headline">12.4K+</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Active Founders</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-bold font-headline">$42M+</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Community Rev</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-bold font-headline">98%</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Satisfaction</span>
            </div>
          </div>

          {/* Floating Dashboard Preview */}
          <div className="mt-24 relative w-full max-w-5xl mx-auto animate-reveal opacity-0" style={{ animationDelay: '1.1s' }}>
            <div className="absolute -inset-4 bg-primary/20 blur-[120px] rounded-full pointer-events-none opacity-50" />
            <GlassCard className="p-1 rounded-[2rem] border-white/10 overflow-hidden relative blue-glow">
               <img 
                 src="https://picsum.photos/seed/dashboard-preview/1200/675" 
                 alt="Dashboard Preview" 
                 className="w-full rounded-[1.8rem] object-cover aspect-video"
                 data-ai-hint="dashboard screen"
               />
            </GlassCard>
            
            {/* Floating UI Elements */}
            <GlassCard className="absolute -top-12 -left-12 p-4 w-48 hidden lg:block animate-float" style={{ animationDuration: '4s' }}>
               <div className="flex items-center gap-2 mb-2">
                 <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                   <TrendingUp className="w-4 h-4 text-white" />
                 </div>
                 <span className="text-xs font-bold">Growth Insight</span>
               </div>
               <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                 <div className="h-full w-[70%] bg-accent cyan-glow" />
               </div>
            </GlassCard>

            <GlassCard className="absolute -bottom-8 -right-8 p-4 w-56 hidden lg:block animate-float" style={{ animationDuration: '5s', animationDelay: '1s' }}>
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full border-2 border-primary p-0.5">
                   <img src="https://picsum.photos/seed/face1/100/100" className="rounded-full" />
                 </div>
                 <div>
                    <p className="text-[10px] font-bold text-primary">NEW MILESTONE</p>
                    <p className="text-xs font-semibold">Sarah hit $10k MRR</p>
                 </div>
               </div>
            </GlassCard>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-3xl font-bold font-headline">AI Mentor Agent</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Personalized strategic advice, automated market analysis, and growth roadmaps generated in seconds.
            </p>
            <ul className="space-y-3 mt-4">
              {['24/7 Strategic Support', 'Roadmap Generation', 'Competitor Analysis'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 group-hover:scale-110 transition-transform">
              <Globe className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-3xl font-bold font-headline">Premium Network</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              High-fidelity community of vetted founders. Connect, collaborate, and scale with the best in the world.
            </p>
            <ul className="space-y-3 mt-4">
              {['Mastermind Groups', 'Expert Q&A Sessions', 'Global Feed Access'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-6 p-8 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
              <Star className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-3xl font-bold font-headline">The Vault</h3>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Proprietary assets, high-converting funnel templates, and branding kits worth thousands of dollars.
            </p>
            <ul className="space-y-3 mt-4">
              {['Proven Funnel Templates', 'Exclusive AI Prompts', 'Legal & Sales Kits'].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                  <CheckCircle2 className="w-4 h-4 text-purple-400" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* AI Assistant Interactive Preview */}
        <section className="max-w-7xl mx-auto px-6 w-full">
          <GlassCard className="p-0 overflow-hidden border-white/10 rounded-[3rem]">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="p-12 md:p-20 flex flex-col justify-center gap-8">
                <Badge variant="outline" className="w-fit border-accent/30 text-accent bg-accent/5">
                  AI CAPABILITIES
                </Badge>
                <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">
                  Your Personal <br /> <span className="text-accent">Strategy Office.</span>
                </h2>
                <p className="text-muted-foreground text-xl leading-relaxed">
                  Legacy AI doesn't just chat. It analyzes your business data, identifies bottlenecks, 
                  and proposes actionable tactical plays to increase your revenue.
                </p>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Market Analysis</p>
                      <p className="text-sm text-muted-foreground">Deep dives into your target audience.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Automation Workflows</p>
                      <p className="text-sm text-muted-foreground">Custom scripts to reclaim your time.</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-accent/20 to-primary/20 p-8 md:p-12 flex items-center justify-center">
                <GlassCard className="w-full max-w-md p-6 border-white/20 shadow-2xl relative animate-float">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center cyan-glow">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold">Legacy AI</h4>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Online</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm text-muted-foreground">
                      How can I scale my agency to $50k MRR this quarter?
                    </div>
                    <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20 text-sm">
                      Based on your current retention rate of 88%, the fastest path is implementing a multi-step 
                      referral loop and increasing your ad spend on LinkedIn by 15%. I've prepared a 30-day 
                      execution roadmap for you.
                    </div>
                    <div className="flex gap-2">
                       <Badge variant="secondary" className="bg-white/5 hover:bg-white/10 cursor-pointer">View Roadmap</Badge>
                       <Badge variant="secondary" className="bg-white/5 hover:bg-white/10 cursor-pointer">Run Ad Analysis</Badge>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <div className="h-12 w-full bg-white/5 border border-white/10 rounded-xl px-4 flex items-center justify-between text-muted-foreground text-sm italic">
                      Type your business goal...
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Pricing Section */}
        <section className="max-w-7xl mx-auto px-6 w-full text-center">
          <div className="flex flex-col items-center gap-6 mb-16">
            <h2 className="text-5xl md:text-7xl font-bold font-headline">Choose Your Path</h2>
            <p className="text-muted-foreground text-xl max-w-2xl">
              Scalable memberships for every stage of your entrepreneurial journey.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Tier */}
            <GlassCard className="flex flex-col gap-8 p-10 h-full border-white/5">
              <div className="text-left">
                <h3 className="text-2xl font-bold font-headline">Explorer</h3>
                <p className="text-muted-foreground mt-2">Get a taste of the hub.</p>
              </div>
              <div className="text-left">
                <span className="text-5xl font-bold">$0</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              <div className="flex-1 space-y-4">
                {['Public Feed Access', 'Basic AI Search', 'Community Profile'].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-white/40" /> {item}
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full h-12 rounded-full border-white/10 hover:bg-white/5">Join Free</Button>
            </GlassCard>

            {/* Pro Tier */}
            <GlassCard glow className="flex flex-col gap-8 p-10 h-full border-primary/20 scale-105 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary blue-glow font-bold px-4 py-1">MOST POPULAR</Badge>
              </div>
              <div className="text-left">
                <h3 className="text-2xl font-bold font-headline text-primary">Pro Founder</h3>
                <p className="text-muted-foreground mt-2">The serious builder's choice.</p>
              </div>
              <div className="text-left">
                <span className="text-5xl font-bold">$97</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              <div className="flex-1 space-y-4">
                {['Full AI Mentor Access', 'The Vault Access (Pro)', 'Private Mastermind Feed', 'Weekly Group Coaching'].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> {item}
                  </div>
                ))}
              </div>
              <Button className="w-full h-14 rounded-full bg-primary hover:bg-primary/90 blue-glow font-bold">Go Pro Now</Button>
            </GlassCard>

            {/* Elite Tier */}
            <GlassCard className="flex flex-col gap-8 p-10 h-full border-white/5">
              <div className="text-left">
                <h3 className="text-2xl font-bold font-headline text-accent">Elite Legacy</h3>
                <p className="text-muted-foreground mt-2">For high-performance leaders.</p>
              </div>
              <div className="text-left">
                <span className="text-5xl font-bold">$297</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              <div className="flex-1 space-y-4">
                {['Everything in Pro', '1-on-1 AI Customization', 'VIP Networking Events', 'Unlimited Vault Assets'].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-accent" /> {item}
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full h-12 rounded-full border-white/10 hover:bg-accent hover:text-black hover:border-accent transition-all font-bold">Join Elite</Button>
            </GlassCard>
          </div>
        </section>

        {/* Testimonials */}
        <section className="max-w-7xl mx-auto px-6 w-full text-center">
           <h2 className="text-4xl font-bold font-headline mb-16">Results From The Hub</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {[
               { name: "Julian Rossi", role: "SaaS Founder", text: "The AI Roadmap shaved 6 months off my development cycle. Vetted network is the best part." },
               { name: "Elena K.", role: "Brand Architect", text: "Legacy Hub isn't just a community; it's an operating system for my business." },
               { name: "David Thorne", role: "Growth Agency", text: "Scale from $0 to $12k MRR in 45 days using the Vault templates. Life-changing." }
             ].map((t, i) => (
               <GlassCard key={i} className="text-left flex flex-col gap-6">
                 <Quote className="w-10 h-10 text-primary opacity-20" />
                 <p className="text-lg text-white/80 leading-relaxed">"{t.text}"</p>
                 <div className="flex items-center gap-3 mt-auto">
                    <div className="w-10 h-10 rounded-full bg-muted">
                      <img src={`https://picsum.photos/seed/t${i}/50/50`} className="rounded-full" />
                    </div>
                    <div>
                      <p className="font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                 </div>
               </GlassCard>
             ))}
           </div>
        </section>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto px-6 w-full">
          <h2 className="text-4xl font-bold font-headline mb-12 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full space-y-4">
            <AccordionItem value="item-1" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">What exactly is Legacy Hub?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                Legacy Hub is a premium membership community for digital entrepreneurs that integrates advanced Generative AI (Gemini 2.5) directly into the experience to provide mentorship, strategy, and automation.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">How does the AI Mentor work?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                The AI Mentor uses your profile data, business goals, and current challenges to generate personalized strategic advice, marketing roadmaps, and tactical steps. It acts as a 24/7 consultant for your digital business.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-white/5 bg-white/[0.02] rounded-2xl px-6">
              <AccordionTrigger className="text-lg font-bold hover:no-underline">Is this for beginners or experts?</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                Both. Our Explorer tier is perfect for those just starting, while our Pro and Elite tiers are designed for scaling existing businesses into the 7 and 8-figure range.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 pt-20">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="flex flex-col gap-6">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center blue-glow group-hover:scale-110 transition-transform">
                  <Zap className="text-white w-5 h-5 fill-white" />
                </div>
                <span className="font-headline font-bold text-2xl tracking-tighter text-white">LEGACY HUB</span>
              </Link>
              <p className="text-muted-foreground text-sm">
                Empowering the next generation of digital giants with the intelligence of tomorrow.
              </p>
            </div>
            
            <div className="flex flex-col gap-4">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Ecosystem</h4>
              <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-white transition-colors">Dashboard</Link>
              <Link href="/community" className="text-sm text-muted-foreground hover:text-white transition-colors">Community</Link>
              <Link href="/mentor" className="text-sm text-muted-foreground hover:text-white transition-colors">AI Mentor</Link>
              <Link href="/marketplace" className="text-sm text-muted-foreground hover:text-white transition-colors">The Vault</Link>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Resources</h4>
              <Link href="#" className="text-sm text-muted-foreground hover:text-white transition-colors">Founders Blog</Link>
              <Link href="#" className="text-sm text-muted-foreground hover:text-white transition-colors">Case Studies</Link>
              <Link href="#" className="text-sm text-muted-foreground hover:text-white transition-colors">Partner Program</Link>
              <Link href="#" className="text-sm text-muted-foreground hover:text-white transition-colors">Support Center</Link>
            </div>

            <div className="flex flex-col gap-6">
              <h4 className="font-bold uppercase tracking-widest text-xs text-muted-foreground">Stay Connected</h4>
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 transition-all cursor-pointer">
                   <Users className="w-4 h-4" />
                 </div>
                 <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 transition-all cursor-pointer">
                   <Globe className="w-4 h-4" />
                 </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                © 2025 Legacy Hub Intelligence. <br /> All rights reserved. Built for the elite.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </AppLayout>
  );
}

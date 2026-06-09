import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { 
  Rocket, 
  Star, 
  Users, 
  Target, 
  ArrowRight, 
  ChevronLeft,
  CheckCircle2, 
  Video, 
  Link as LinkIcon, 
  Mail, 
  Filter, 
  Palette, 
  Megaphone, 
  MessageSquare,
  Zap
} from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { cn } from "@/lib/utils";

const options = [
  { 
    id: 'smm', 
    label: 'Social Media Marketer', 
    icon: <Users className="w-6 h-6" />, 
    desc: "Runs Instagram, TikTok, Facebook, and other social pages to grow audiences and sales." 
  },
  { 
    id: 'creator', 
    label: 'Content Creator', 
    icon: <Video className="w-6 h-6" />, 
    desc: "Creates videos, posts, graphics, and online content that attract attention and engagement." 
  },
  { 
    id: 'affiliate', 
    label: 'Affiliate Marketer', 
    icon: <LinkIcon className="w-6 h-6" />, 
    desc: "Promotes other people’s products online and earns commissions from sales." 
  },
  { 
    id: 'email', 
    label: 'Email Marketing Specialist', 
    icon: <Mail className="w-6 h-6" />, 
    desc: "Sends marketing emails, promotions, and automated follow-up campaigns to customers." 
  },
  { 
    id: 'funnel', 
    label: 'Sales Funnel Builder', 
    icon: <Filter className="w-6 h-6" />, 
    desc: "Creates landing pages and automated systems that turn visitors into buyers." 
  },
  { 
    id: 'brand', 
    label: 'Brand Strategist', 
    icon: <Palette className="w-6 h-6" />, 
    desc: "Helps businesses build a strong online image, identity, and customer trust." 
  },
  { 
    id: 'ads', 
    label: 'Digital Ads Specialist', 
    icon: <Megaphone className="w-6 h-6" />, 
    desc: "Runs paid ads on Facebook, Instagram, TikTok, Google, and YouTube to generate leads and sales." 
  },
  { 
    id: 'consultant', 
    label: 'Online Sales Consultant', 
    icon: <MessageSquare className="w-6 h-6" />, 
    desc: "Helps businesses or creators increase online sales through marketing strategies and customer conversion techniques." 
  }
];

export function IdentityStep() {
  const { identities, toggleIdentity, nextStep, prevStep } = useOnboardingStore();

  return (
    <div className="flex flex-col gap-8">
      <button
        type="button"
        onClick={prevStep}
        className="w-fit flex items-center gap-2 text-white/30 hover:text-white transition-colors group"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="text-center space-y-3">
        <h2 className="text-4xl md:text-5xl font-bold font-headline tracking-tight">Select Your Identity</h2>
        <p className="text-muted-foreground text-xl">Select all that apply to your current business model.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {options.map(opt => {
          const isSelected = identities.includes(opt.id);
          return (
            <GlassCard 
              key={opt.id} 
              onClick={() => toggleIdentity(opt.id)}
              className={cn(
                "flex flex-col gap-4 p-6 cursor-pointer border-2 transition-all duration-500 group relative overflow-hidden",
                isSelected ? 'border-primary bg-primary/10 blue-glow scale-[1.02]' : 'border-white/5 hover:border-white/20'
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500",
                isSelected ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground group-hover:text-white'
              )}>
                {opt.icon}
              </div>
              <div>
                <h3 className={cn(
                  "text-lg font-bold transition-colors leading-tight",
                  isSelected ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                )}>{opt.label}</h3>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{opt.desc}</p>
              </div>
              {isSelected && (
                <div className="absolute top-4 right-4 animate-in fade-in zoom-in">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      <div className="flex justify-center mt-8">
        <Button 
          disabled={identities.length === 0}
          onClick={nextStep}
          className="h-14 px-12 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group transition-all active:scale-95 disabled:opacity-30"
        >
          Confirm Identities ({identities.length})
          <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
        </Button>
      </div>
    </div>
  );
}

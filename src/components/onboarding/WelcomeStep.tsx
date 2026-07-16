import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, GraduationCap, MessagesSquare, PenTool, Route, Sparkles, Users } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useRouter } from "next/navigation";

export function WelcomeStep() {
  const { nextStep, plan } = useOnboardingStore();
  const router = useRouter();
  const planLabel = plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Explorer";

  return (
    <div className="relative grid gap-8 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
      <button
        onClick={() => router.push('/')}
        className="absolute -top-6 left-0 flex items-center gap-2 text-white/40 hover:text-white transition-colors group"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-semibold uppercase tracking-widest">Exit to Home</span>
      </button>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-left shadow-2xl backdrop-blur-xl md:p-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#BFC6D4]">
          <Sparkles className="h-4 w-4 text-[#8B5CF6]" />
          {planLabel} setup
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-white md:text-6xl">
          Build your AI operating system for digital business.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[#BFC6D4]">
          In a few focused steps, Soma will learn your goals, map your business roadmap, and connect you to the right mix of AI Studio, Mentor, Academy, Community, Marketplace, and automation tools.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            { icon: Route, label: "Business roadmap" },
            { icon: PenTool, label: "AI content studio" },
            { icon: MessagesSquare, label: "AI mentor context" },
            { icon: GraduationCap, label: "Academy path" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#151A2E]/70 px-4 py-3 text-sm text-white/85">
              <item.icon className="h-4 w-4 text-[#4F9DFF]" />
              {item.label}
            </div>
          ))}
        </div>
        <Button
          onClick={nextStep}
          className="mt-8 h-14 rounded-2xl bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-8 text-base font-semibold text-white shadow-[0_18px_60px_rgba(91,95,255,.28)] transition-all group hover:scale-[1.01]"
        >
          Begin business setup
          <ArrowRight className="ml-3 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[#151A2E]/60 p-6 text-left shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7E8799]">Your setup creates</p>
        <div className="mt-5 space-y-4">
          {[
            ["Roadmap", "A practical path from your current stage to your next business milestone."],
            ["Memory", "Preferences and goals your AI Mentor can use across sessions."],
            ["Execution", "Clear next actions for content, learning, community, and monetization."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-white">
                <Users className="h-4 w-4 text-[#8B5CF6]" />
                <span className="font-medium">{title}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

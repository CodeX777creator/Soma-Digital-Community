"use client";

import { Sparkles } from "lucide-react";
import { getTierPrivileges } from "@/lib/tier-privileges";
import { useUserStore } from "@/store/useUserStore";

function labelModelClass(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ModelAccessNotice({ compact = false }: { compact?: boolean }) {
  const tier = useUserStore((state) => state.tier);
  const privileges = getTierPrivileges(tier);
  const classes = privileges.aiModelClasses.map(labelModelClass).join(", ");

  return (
    <div className={compact ? "flex items-center gap-2 text-xs text-[#BFC6D4]" : "rounded-[14px] border border-white/[0.08] bg-white/[0.035] p-3 text-xs leading-5 text-[#BFC6D4]"}>
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" aria-hidden="true" />
      <span><span className="font-medium text-white">Model access:</span> {classes}. Higher classes depend on your plan and Creator Credits.</span>
    </div>
  );
}

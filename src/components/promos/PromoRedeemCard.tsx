"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Gift, Loader2, Sparkles, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authFetch, parseApiError } from "@/lib/clientApi";
import { cn } from "@/lib/utils";

type PromoRedeemCardProps = {
  compact?: boolean;
  defaultCode?: string;
  source?: string;
  surface?:
    | "onboarding"
    | "dashboard"
    | "academy_course"
    | "academy_checkout"
    | "mrr_checkout"
    | "creator_credits"
    | "subscription_checkout"
    | "marketplace_product"
    | "marketplace_checkout";
  context?: {
    courseId?: string;
    productId?: string;
    planId?: string;
    creditBundleId?: string;
    checkoutType?: string;
  };
  title?: string;
  description?: string;
  className?: string;
  onRedeemed?: (result: { benefitsGranted: string[]; code: string }) => void;
};

function benefitLabel(benefit: string) {
  if (benefit.startsWith("academy_course_free")) return "Digital Marketing Certification included";
  if (benefit.startsWith("mrr_license_unlock")) return "MRR eligibility reserved";
  if (benefit.startsWith("creator_credit_bonus")) return "Creator Credits added";
  if (benefit.startsWith("subscription_discount")) return "Plan benefit reserved";
  if (benefit.startsWith("marketplace_product_free")) return "Marketplace product included";
  if (benefit.startsWith("marketplace_product_discount")) return "Marketplace product benefit reserved";
  if (benefit.startsWith("academy_course_discount")) return "Academy benefit reserved";
  return "Benefit reserved";
}

function friendlyError(code?: string, fallback?: string) {
  switch (code) {
    case "PROMO_ALREADY_REDEEMED":
      return "This bonus has already been unlocked on your account.";
    case "PROMO_EMAIL_ALREADY_REDEEMED":
      return "This email has already unlocked this bonus.";
    case "PROMO_REDEMPTION_LIMIT_REACHED":
      return "This campaign has reached its unlock limit.";
    case "PROMO_EXPIRED":
      return "This campaign has ended.";
    case "PROMO_NOT_ACTIVE":
      return "This campaign is not active yet.";
    case "PROMO_PLAN_NOT_ELIGIBLE":
      return "Your current plan is not eligible for this campaign.";
    case "PROMO_WRONG_SURFACE":
      return "This bonus is valid, but it cannot be used here. Try it in the matching area instead.";
    case "PROMO_TARGET_MISMATCH":
      return "This bonus is valid, but it is for a different item.";
    default:
      return fallback || "We could not apply that code. Please check it and try again.";
  }
}

function inferSurface(path?: string): PromoRedeemCardProps["surface"] {
  if (!path) return "dashboard";
  if (path === "/open" || path.startsWith("/open?")) return "onboarding";
  if (path.startsWith("/academy/")) return "academy_course";
  if (path.startsWith("/marketplace/")) return "marketplace_product";
  if (path.startsWith("/settings/credits")) return "creator_credits";
  if (path.startsWith("/settings/billing")) return "subscription_checkout";
  return "dashboard";
}

export function PromoRedeemCard({
  compact = false,
  defaultCode = "",
  source = "promo_card",
  surface,
  context,
  title = "Founder Member Bonus",
  description = "Enter your invite code to unlock eligible Academy, Creator Credit, subscription, or product benefits.",
  className,
  onRedeemed,
}: PromoRedeemCardProps) {
  const [code, setCode] = useState(defaultCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError("");
    setBenefits([]);
    try {
      const response = await authFetch("/api/promos/redeem", {
        method: "POST",
        body: JSON.stringify({
          code,
          source,
          surface: surface || inferSurface(typeof window !== "undefined" ? window.location.pathname : undefined),
          context,
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      if (!response.ok) throw await parseApiError(response, "Could not apply that code.");
      const payload = await response.json();
      const granted = payload.redemption?.benefitsGranted || [];
      setBenefits(granted);
      onRedeemed?.({ benefitsGranted: granted, code: payload.redemption?.code || code });
    } catch (err) {
      const parsed = err as { code?: string; userMessage?: string; message?: string };
      setError(friendlyError(parsed?.code, parsed?.userMessage || parsed?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={cn(
      "overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#151A2E]/78 shadow-[0_22px_80px_rgba(0,0,0,.28)]",
      className
    )}>
      <div className={cn("relative", compact ? "p-5" : "p-6")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(139,92,246,.28),transparent_34%),radial-gradient(circle_at_12%_0%,rgba(79,157,255,.16),transparent_38%)]" />
        <div className="relative">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] shadow-[0_16px_40px_rgba(91,95,255,.28)]">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#C4B5FD]">
                <Sparkles className="h-3.5 w-3.5" />
                Premium unlock
              </div>
              <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#BFC6D4]">{description}</p>
            </div>
          </div>

          <form onSubmit={redeem} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="promo-code">Promo code</label>
            <input
              id="promo-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="h-12 min-w-0 flex-1 rounded-[15px] border border-white/[0.08] bg-black/20 px-4 text-sm font-semibold uppercase tracking-[0.08em] text-white outline-none transition focus:border-[#8B5CF6]/55"
            />
            <Button type="submit" disabled={loading || !code.trim()} className="h-12 rounded-[15px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketPercent className="h-4 w-4" />}
              Unlock
            </Button>
          </form>

          {error ? <p className="mt-3 rounded-[14px] border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
          {benefits.length ? (
            <div className="mt-4 rounded-[16px] border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
                Founder Member Bonus unlocked
              </div>
              <div className="mt-3 grid gap-2">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2 text-sm text-emerald-50/90">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {benefitLabel(benefit)}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-emerald-50/75">
                Complete the course to unlock reseller rights where your campaign includes MRR eligibility.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

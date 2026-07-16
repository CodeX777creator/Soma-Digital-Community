export type OnboardingEventName =
  | "onboarding_started"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_account_created"
  | "onboarding_roadmap_generated"
  | "onboarding_completed"
  | "onboarding_abandoned";

export async function trackOnboardingEvent(
  event: OnboardingEventName,
  metadata: Record<string, unknown> = {}
) {
  if (typeof window === "undefined") return;

  try {
    const payload = JSON.stringify({
      event,
      metadata,
      path: window.location.pathname,
      search: window.location.search,
      occurredAt: new Date().toISOString(),
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/onboarding/events", blob);
      return;
    }

    await fetch("/api/onboarding/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: payload,
      keepalive: true,
    });
  } catch {
    // Onboarding telemetry must never block account setup.
  }
}

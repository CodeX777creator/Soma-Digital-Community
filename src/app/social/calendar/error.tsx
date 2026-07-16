"use client";

import { useEffect } from "react";
import { RecoverableErrorCard } from "@/components/error/ErrorStates";
import { logAppError, trackErrorEvent } from "@/lib/error-observability";

export default function SchedulerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logAppError(error, { feature: "scheduler", action: "route_error_boundary", metadata: { digest: error.digest } });
    trackErrorEvent("route_error_boundary_triggered", error, { feature: "scheduler", action: "route_error_boundary", metadata: { digest: error.digest } });
  }, [error]);

  return <RecoverableErrorCard error={error} title="Scheduler could not load" onRetry={reset} actionHref="/social" actionLabel="Open Social Hub" className="m-6" />;
}

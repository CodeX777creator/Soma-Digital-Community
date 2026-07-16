"use client";

import { useEffect } from "react";
import { RecoverableErrorCard } from "@/components/error/ErrorStates";
import { logAppError, trackErrorEvent } from "@/lib/error-observability";

export default function SocialError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logAppError(error, { feature: "social", action: "route_error_boundary", metadata: { digest: error.digest } });
    trackErrorEvent("route_error_boundary_triggered", error, { feature: "social", action: "route_error_boundary", metadata: { digest: error.digest } });
  }, [error]);

  return <RecoverableErrorCard error={error} title="Social Hub could not load" onRetry={reset} actionHref="/dashboard" actionLabel="Go to Dashboard" className="m-6" />;
}

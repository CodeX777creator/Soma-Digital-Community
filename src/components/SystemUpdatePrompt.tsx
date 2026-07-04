"use client";

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useServiceWorkerUpdate } from "@/hooks/use-service-worker-update";

export function SystemUpdatePrompt() {
  const { toast } = useToast();
  const {
    hasUpdate,
    checkForUpdate,
    updateApp,
    dismissUpdate,
  } = useServiceWorkerUpdate();

  useEffect(() => {
    // Check for updates on mount
    checkForUpdate();

    // Check periodically (e.g., every 30 minutes)
    const interval = setInterval(checkForUpdate, 30 * 60 * 1000);

    // Listen for service worker messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_AVAILABLE") {
        checkForUpdate();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", handleMessage);
    }

    return () => {
      clearInterval(interval);
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", handleMessage);
      }
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (hasUpdate) {
      // Show a toast notification
      toast({
        title: "Update Available",
        description: "A new version of the app is ready. Update now for the latest features?",
        duration: 0, // Keep visible until dismissed
        action: (
          <div className="flex gap-2">
            <button
              onClick={dismissUpdate}
              className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Later
            </button>
            <button
              onClick={updateApp}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Update Now
            </button>
          </div>
        ),
      });
    }
  }, [hasUpdate, toast, dismissUpdate, updateApp]);

  return null; // This component doesn't render visible UI, it just manages the toast
}

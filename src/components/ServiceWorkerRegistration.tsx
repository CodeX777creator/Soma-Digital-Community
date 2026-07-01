"use client";

import { useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import { offlineQueue } from "@/lib/offline";
import { useToast } from "@/hooks/use-toast";

export function ServiceWorkerRegistration() {
  const { toast } = useToast();

  const handleServiceWorkerMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'SYNC_POSTS') {
      // Process offline queue when sync event fires
      offlineQueue.processQueue().then(() => {
        toast({
          title: "Sync complete",
          description: "Your offline changes have been synchronized.",
        });
      }).catch((error) => {
        logger.error('Failed to process offline queue', error instanceof Error ? error : undefined);
      });
    }
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Listen for messages from service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [handleServiceWorkerMessage]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          logger.info("Service Worker registered", {
            scope: registration.scope,
          });

          // Handle updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // New version available
                  logger.info("New service worker available");
                  
                  // Show update notification to user
                  toast({
                    title: "Update available",
                    description: "A new version is available. Please refresh to update.",
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          logger.error("Service Worker registration failed", error instanceof Error ? error : undefined);
        });
    }
  }, [toast]);

  return null;
}

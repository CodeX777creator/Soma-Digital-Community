"use client";

import { useState, useEffect, useCallback } from "react";

interface UpdateInfo {
  version: string;
  waitingWorker?: ServiceWorker;
}

export function useServiceWorkerUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    
    if (!registration) return;

    // Check if there's a waiting worker
    if (registration.waiting) {
      setHasUpdate(true);
      setUpdateInfo({
        version: "1.1.0", // This would ideally come from the SW message
        waitingWorker: registration.waiting,
      });
      return;
    }

    // Check for new updates by registering a fresh SW
    try {
      const newRegistration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none",
      });

      if (newRegistration.waiting) {
        setHasUpdate(true);
        setUpdateInfo({
          version: "1.1.0",
          waitingWorker: newRegistration.waiting,
        });
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  }, []);

  const updateApp = useCallback(async () => {
    if (!updateInfo?.waitingWorker) return;

    try {
      // Skip waiting forces the new SW to take control immediately
      updateInfo.waitingWorker.postMessage({ type: "SKIP_WAITING" });
      
      // Listen for the controller change
      return new Promise<void>((resolve) => {
        const onControllerChange = () => {
          window.location.reload();
          resolve();
        };

        // Set up a listener for when the SW takes control
        window.addEventListener("beforeunload", onControllerChange);
        
        // Also try to skip waiting via the API
        if (navigator.serviceWorker.controller) {
           navigator.serviceWorker.addEventListener("controllerchange", () => {
             window.location.reload();
             resolve();
           });
        }

        // Timeout fallback
        setTimeout(() => {
          window.location.reload();
          resolve();
        }, 2000);
      });
    } catch (error) {
      console.error("Failed to update app:", error);
    }
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => {
    // Tell the waiting worker to skip waiting (activate immediately without reload)
    // This prevents the prompt from showing again until the next deployment
    if (updateInfo?.waitingWorker) {
      updateInfo.waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    setHasUpdate(false);
    setUpdateInfo(null);
  }, [updateInfo]);

  return {
    hasUpdate,
    updateInfo,
    checkForUpdate,
    updateApp,
    dismissUpdate,
  };
}
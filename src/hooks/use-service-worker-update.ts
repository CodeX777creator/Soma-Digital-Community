"use client";

import { useState, useEffect, useCallback } from "react";

interface UpdateInfo {
  version?: string;
  waitingWorker?: ServiceWorker;
}

async function readWorkerVersion(worker: ServiceWorker | null): Promise<string | undefined> {
  if (!worker) return undefined;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(undefined), 1500);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(typeof event.data?.version === "string" ? event.data.version : undefined);
    };
    try {
      worker.postMessage({ type: "VERSION_CHECK" }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      resolve(undefined);
    }
  });
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

    try {
      await registration.update();
    } catch {
      // The active worker can continue serving the current app if an update check fails.
      return;
    }

    if (registration.waiting) {
      setHasUpdate(true);
      setUpdateInfo({
        version: await readWorkerVersion(registration.waiting),
        waitingWorker: registration.waiting,
      });
      return;
    }
  }, []);

  const updateApp = useCallback(async () => {
    if (!updateInfo?.waitingWorker) return;

    try {
      // Skip waiting forces the new SW to take control immediately
      updateInfo.waitingWorker.postMessage({ type: "SKIP_WAITING" });
      
      return new Promise<void>((resolve) => {
        let settled = false;
        const cleanup = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
          window.clearTimeout(timeout);
        };
        const onControllerChange = () => {
          if (settled) return;
          settled = true;
          cleanup();
          window.location.reload();
          resolve();
        };
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          window.location.reload();
          resolve();
        }, 2000);

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        updateInfo.waitingWorker?.postMessage({ type: "SKIP_WAITING" });
      });
    } catch (error) {
      console.error("Failed to update app:", error);
    }
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => {
    // Keep the current worker active until the user explicitly updates.
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

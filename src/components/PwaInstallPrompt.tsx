"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandaloneApp } from "@/lib/auth";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_UNTIL_KEY = "soma-install-dismissed-until";
const INSTALL_OUTCOME_KEY = "soma-install-outcome";
const INSTALL_SESSION_KEY = "soma-install-prompt-seen";

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is optional in private browsing.
  }
}

function writeSessionFlag() {
  try {
    window.sessionStorage.setItem(INSTALL_SESSION_KEY, "true");
  } catch {
    // Session storage is optional.
  }
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [installError, setInstallError] = useState(false);
  const installButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneApp()) return;

    const dismissedUntil = Number(readStorage(DISMISSED_UNTIL_KEY) || 0);
    if (dismissedUntil > Date.now()) {
      setDismissed(true);
      return;
    }

    try {
      if (window.sessionStorage.getItem(INSTALL_SESSION_KEY) === "true") {
        setDismissed(true);
        return;
      }
    } catch {
      // Session storage is optional.
    }

    const userAgent = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    setIsIosSafari(isIos && isSafari);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      writeSessionFlag();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      writeStorage(INSTALL_OUTCOME_KEY, "accepted");
      setInstallPrompt(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (installPrompt) {
      installButtonRef.current?.focus();
    }
  }, [installPrompt]);

  const handleInstall = async () => {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      writeStorage(INSTALL_OUTCOME_KEY, choice.outcome === "accepted" ? "accepted" : "declined");
      writeSessionFlag();
      if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
        setInstallPrompt(null);
      }
    } catch {
      writeStorage(INSTALL_OUTCOME_KEY, "error");
      setInstallError(true);
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    writeStorage(DISMISSED_UNTIL_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    writeStorage(INSTALL_OUTCOME_KEY, "declined");
    writeSessionFlag();
    setDismissed(true);
  };

  if ((!installPrompt && !isIosSafari && !installError) || dismissed) return null;

  return (
    <div role="dialog" aria-label="Install Soma Digital" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-[120] mx-auto max-w-md rounded-lg border border-primary/25 bg-background/95 p-4 shadow-2xl backdrop-blur-xl sm:left-auto sm:mx-0">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Install Soma Digital</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Add the community to your device for faster access.</p>
          {isIosSafari && !installPrompt && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Tap Share, then choose <span className="font-semibold text-white">Add to Home Screen</span>.
            </p>
          )}
          {installError && (
            <p className="mt-2 text-xs text-destructive">Installation could not start. Try your browser&apos;s install menu.</p>
          )}
          <div className="mt-3 flex gap-2">
            {installPrompt && <Button ref={installButtonRef} size="sm" onClick={handleInstall}>Install</Button>}
            <Button size="sm" variant="ghost" onClick={handleDismiss}>Not now</Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-white"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

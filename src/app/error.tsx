"use client";

import { useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log to error tracking service
    logger.error("Global error boundary caught error", error, {
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,183,255,0.1),transparent_50%)]" />
      
      <GlassCard className="max-w-lg w-full p-8 text-center relative z-10">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground text-sm mb-6">
          We&apos;ve encountered an unexpected error. Our team has been notified and we&apos;re working to fix it.
        </p>

        {process.env.NODE_ENV === "development" && (
          <div className="mb-6 p-4 bg-red-500/5 rounded-lg border border-red-500/10 text-left overflow-auto max-h-48">
            <p className="text-xs font-mono text-red-300 break-all">
              {error.message}
            </p>
            {error.stack && (
              <pre className="text-xs font-mono text-red-300/70 mt-2 whitespace-pre-wrap">
                {error.stack}
              </pre>
            )}
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            variant="outline"
            className="border-white/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button
            asChild
            className="bg-primary hover:bg-primary/90"
          >
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Link>
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

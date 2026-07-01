"use client";

import { useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { logger } from "@/lib/logger";

interface CommunityErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CommunityError({ error, reset }: CommunityErrorProps) {
  useEffect(() => {
    logger.error("Community error boundary caught error", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,183,255,0.1),transparent_50%)]" />
      
      <GlassCard className="max-w-lg w-full p-8 text-center relative z-10">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        
        <h1 className="text-xl font-bold mb-2">Community Feed Unavailable</h1>
        <p className="text-muted-foreground text-sm mb-6">
          We&apos;re having trouble loading the community feed. This might be due to a network issue or temporary service disruption.
        </p>
        
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
            <Link href="/community">
              <Users className="w-4 h-4 mr-2" />
              Reload Feed
            </Link>
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

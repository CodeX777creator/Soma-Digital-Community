import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Ghost, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,183,255,0.1),transparent_50%)]" />
      
      <GlassCard className="max-w-md w-full p-8 text-center relative z-10">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 border border-primary/20">
          <Ghost className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-6xl font-bold font-headline mb-2">404</h1>
        <h2 className="text-xl font-bold mb-3">Page Not Found</h2>
        <p className="text-muted-foreground text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved to another dimension.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            className="border-white/10"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            asChild
            className="bg-primary hover:bg-primary/90"
          >
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Link>
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

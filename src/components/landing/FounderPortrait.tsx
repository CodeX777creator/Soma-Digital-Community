"use client";

import { OptimizedImage } from "@/components/ui/optimized-image";
import { GlassCard } from "@/components/ui/glass-card";
import { Quote } from "lucide-react";

interface FounderPortraitProps {
  imageSrc?: string;
  fallbackSrc?: string;
  quote?: string;
  author?: string;
}

/**
 * FounderPortrait - Optimized founder image with quote card
 * 
 * Features:
 * - Lazy loading (loads when scrolled into view)
 * - WebP format with PNG fallback
 * - Smooth fade-in animation
 * - Error handling with retry
 * - Responsive sizing
 */
export function FounderPortrait({
  imageSrc = "/images/founder_portrait.webp",
  fallbackSrc = "/images/founder_portrait.png",
  quote = "We aren't here to fake success. We're here to build it, brick by brick, together.",
  author = "Founder, Soma Digital",
}: FounderPortraitProps) {
  return (
    <div className="relative">
      {/* Background glow effect */}
      <div className="absolute -inset-4 bg-primary/20 blur-[100px] rounded-full opacity-30" />
      
      {/* Main image container */}
      <div className="rounded-[3rem] w-full h-[400px] sm:h-[500px] lg:h-[600px] border border-white/10 shadow-2xl relative z-10 overflow-hidden">
        <OptimizedImage
          src={imageSrc}
          alt="Founder of Soma Digital"
          containerClassName="w-full h-full"
          className="w-full h-full object-cover object-top"
          fallbackSrc={fallbackSrc}
          // Optional: Add blur placeholder for better UX
          // blurDataUrl="data:image/webp;base64,UklGR..."
        />
      </div>
      
      {/* Floating quote card */}
      <GlassCard 
        className="absolute -bottom-8 -right-8 p-6 w-72 z-20 animate-float hidden sm:block" 
        style={{ animationDuration: '10s' }}
      >
        <Quote className="w-8 h-8 text-primary mb-4 opacity-50" />
        <p className="text-sm italic text-white/90 leading-relaxed mb-4">
          &ldquo;{quote}&rdquo;
        </p>
        <p className="font-bold text-sm">{author}</p>
      </GlassCard>
    </div>
  );
}

/**
 * FounderPortraitSkeleton - Loading state
 */
export function FounderPortraitSkeleton() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-primary/20 blur-[100px] rounded-full opacity-30" />
      <div className="rounded-[3rem] w-full h-[400px] sm:h-[500px] lg:h-[600px] border border-white/10 shadow-2xl relative z-10 bg-white/5 animate-pulse" />
    </div>
  );
}

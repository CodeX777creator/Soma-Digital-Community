"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";
import { ImageOff } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
  onError?: () => void;
  onLoad?: () => void;
  fallbackSrc?: string;
  blurDataUrl?: string;
  aspectRatio?: string;
}

export function OptimizedImage({
  src,
  alt,
  className,
  containerClassName,
  priority = false,
  onError,
  onLoad,
  fallbackSrc,
  blurDataUrl,
  aspectRatio,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(!priority);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const isMounted = useRef(true);
  const retryCount = useRef(0);
  const maxRetries = 2;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Reset state when src changes
  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setIsLoading(!priority);
    retryCount.current = 0;
  }, [src, priority]);

  const handleLoad = useCallback(() => {
    if (isMounted.current) {
      setIsLoading(false);
      onLoad?.();
    }
  }, [onLoad]);

  const handleError = useCallback(() => {
    if (!isMounted.current) return;

    // Try fallback first
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
    }

    // Retry with delay if haven't exceeded max retries
    if (retryCount.current < maxRetries) {
      retryCount.current++;
      setTimeout(() => {
        if (isMounted.current) {
          // Force reload by appending timestamp
          setCurrentSrc(`${src}?retry=${Date.now()}`);
        }
      }, 1000 * retryCount.current);
      return;
    }

    setIsLoading(false);
    setHasError(true);
    onError?.();
  }, [onError, fallbackSrc, currentSrc, src]);

  if (hasError) {
    return (
      <div
        className={cn(
          "bg-white/5 flex flex-col items-center justify-center text-muted-foreground gap-2",
          containerClassName
        )}
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <ImageOff className="w-8 h-8 opacity-50" />
        <span className="text-xs">Failed to load image</span>
      </div>
    );
  }

  return (
    <div 
      className={cn("relative overflow-hidden", containerClassName)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {isLoading && (
        <>
          <Skeleton className="absolute inset-0" />
          {blurDataUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center blur-xl scale-110"
              style={{ backgroundImage: `url(${blurDataUrl})` }}
            />
          )}
        </>
      )}
      <img
        src={currentSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
      />
    </div>
  );
}

// Avatar image with fallback
interface OptimizedAvatarProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-base",
  xl: "w-24 h-24 text-lg",
};

export function OptimizedAvatar({
  src,
  alt,
  size = "md",
  className,
  priority = false,
}: OptimizedAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!priority);
  const initials = alt
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (!src || hasError) {
    return (
      <div
        className={cn(
          "rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-medium",
          sizeClasses[size],
          className
        )}
        title={alt}
      >
        {initials || "?"}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "relative rounded-full overflow-hidden",
        sizeClasses[size].split(' ')[0], // Only take width/height classes
        className
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-primary/20 animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

// Image grid with lazy loading
interface OptimizedImageGridProps {
  images: Array<{
    src: string;
    alt: string;
  }>;
  className?: string;
  columns?: 2 | 3 | 4;
}

export function OptimizedImageGrid({
  images,
  className,
  columns = 3,
}: OptimizedImageGridProps) {
  const columnClasses = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  return (
    <div className={cn(`grid ${columnClasses[columns]} gap-2`, className)}>
      {images.map((image, index) => (
        <OptimizedImage
          key={`${image.src}-${index}`}
          src={image.src}
          alt={image.alt}
          containerClassName="aspect-square rounded-lg"
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
        />
      ))}
    </div>
  );
}

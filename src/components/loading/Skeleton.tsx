"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "default" | "card" | "avatar" | "text" | "button";
}

export function Skeleton({ className, variant = "default" }: SkeletonProps) {
  const baseStyles = "animate-pulse bg-white/5 rounded-lg";
  
  const variants = {
    default: "",
    card: "w-full h-32",
    avatar: "w-12 h-12 rounded-full",
    text: "h-4 w-3/4",
    button: "h-10 w-24",
  };

  return (
    <div
      className={cn(
        baseStyles,
        variants[variant],
        className
      )}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 rounded-3xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center gap-4">
          <Skeleton variant="avatar" className="w-12 h-12" />
          <div className="space-y-2">
            <Skeleton variant="text" className="w-48 h-8" />
            <Skeleton variant="text" className="w-32 h-4" />
          </div>
        </div>
        <Skeleton variant="button" className="h-12 w-32" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-32" />
        </div>
        <div className="lg:col-span-6">
          <Skeleton variant="card" className="h-96" />
        </div>
        <div className="lg:col-span-3 flex flex-col gap-6">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-48" />
        </div>
      </div>
    </div>
  );
}

export function CommunitySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5">
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" className="h-48" />
      </div>
      <div className="lg:col-span-6 flex flex-col gap-6">
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
      </div>
      <div className="hidden lg:flex lg:col-span-3 flex-col gap-5">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
      </div>
    </div>
  );
}

export function MentorSkeleton() {
  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-4 lg:flex-row">
      <Skeleton variant="card" className="hidden lg:flex w-80" />
      <Skeleton variant="card" className="flex-1" />
    </div>
  );
}

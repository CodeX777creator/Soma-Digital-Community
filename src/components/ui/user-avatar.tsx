"use client";

import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export const UserAvatar = ({ src, name, className, size = "md" }: UserAvatarProps) => {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-16 h-16 text-lg",
    xl: "w-24 h-24 text-2xl",
  };

  const getInitials = (n: string) => {
    return n
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const initials = name ? getInitials(name) : null;

  return (
    <div className={cn(
      "relative flex shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 items-center justify-center font-bold font-mono text-muted-foreground",
      sizeClasses[size],
      className
    )}>
      {src ? (
        <img 
          src={src} 
          alt={name || "User"} 
          title={name || "User"} 
          className="aspect-square h-full w-full object-cover" 
          onError={(e) => {
             // If image fails to load, hide it to show initials
             (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : initials ? (
        <span className="text-primary blue-glow-text">{initials}</span>
      ) : (
        <User className="w-1/2 h-1/2 opacity-20" />
      )}
    </div>
  );
};

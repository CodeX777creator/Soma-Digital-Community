import React from "react"
import { cn } from "@/lib/utils"

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
  glow?: boolean
}

export const GlassCard = ({
  children,
  className,
  glow = false,
  ...props
}: GlassCardProps) => {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-6 transition-all duration-300 hover:border-[#8B5CF6]/25",
        glow && "blue-glow",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, Bell, Search, Menu, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const pathname = usePathname();

  return (
    <nav className="glass-nav sticky top-0 z-50 px-4 py-3 md:px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center blue-glow group-hover:scale-110 transition-transform">
              <Zap className="text-white w-5 h-5 fill-white" />
            </div>
            <span className="font-headline font-bold text-xl tracking-tighter text-white">LEGACY HUB</span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/dashboard" className={cn("hover:text-white transition-colors", pathname === "/dashboard" && "text-white")}>Dashboard</Link>
            <Link href="/community" className={cn("hover:text-white transition-colors", pathname === "/community" && "text-white")}>Community</Link>
            <Link href="/mentor" className={cn("hover:text-white transition-colors", pathname === "/mentor" && "text-white")}>AI Mentor</Link>
            <Link href="/marketplace" className={cn("hover:text-white transition-colors", pathname === "/marketplace" && "text-white")}>Marketplace</Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-accent cyan-glow">
            <Zap className="w-3 h-3 fill-accent" />
            <span>LEVEL 12</span>
          </div>
          <Button variant="ghost" size="icon" className="hidden sm:flex text-muted-foreground hover:text-white">
            <Search className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
            <Bell className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="w-9 h-9 rounded-full border border-primary/30 p-0.5 blue-glow">
             <div className="w-full h-full rounded-full bg-muted overflow-hidden">
                <img src="https://picsum.photos/seed/user12/100/100" alt="Profile" className="w-full h-full object-cover" />
             </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

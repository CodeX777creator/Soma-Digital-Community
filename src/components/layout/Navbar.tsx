"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, Bell, Search, Menu, X, ArrowRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useUserStore } from "@/store/useUserStore";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNotifications } from "@/hooks/useNotifications";

export const Navbar = () => {
  const pathname = usePathname();
  const { user, userData } = useAuth();
  const { xp, level, tier } = useUserStore();
  const { unreadCount } = useNotifications(user?.uid);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isLandingPage = pathname === "/";
  const isLoggedIn = !!user;

  const landingLinks = [
    { name: "Home", href: "/#hero" },
    { name: "Features", href: "/#features" },
    { name: "Results", href: "/#results" },
    { name: "Pricing", href: "/#pricing" },
  ];

  const appLinks = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Community", href: "/community" },
    { name: "AI Mentor", href: "/mentor" },
    { name: "Marketplace", href: "/marketplace" },
    { name: "My Courses", href: "/my-courses" },
    { name: "Reseller", href: "/reseller" },
  ];

  const links = isLoggedIn ? appLinks : landingLinks;

  return (
    <nav
      className={cn(
        "sticky top-0 z-[100] transition-all duration-500",
        isScrolled
          ? "py-3 px-4 md:px-8 bg-black/60 backdrop-blur-xl border-b border-white/5"
          : "py-6 px-4 md:px-8 bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center blue-glow group-hover:scale-110 transition-transform">
              <Zap className="text-white w-5 h-5 fill-white" />
            </div>
            <span className="font-headline font-bold text-xl tracking-tighter text-white">SOMA DIGITAL</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            {links.map((link) => {
              const isActive = pathname === link.href || (link.href.startsWith("/#") && pathname === "/");
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={cn(
                    "relative py-2 transition-colors",
                    isActive ? "text-white" : "text-muted-foreground hover:text-white"
                  )}
                >
                  {link.name}
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary blue-glow"
                      transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-accent cyan-glow tracking-widest">
                <Zap className="w-3 h-3 fill-accent" />
                <span>LVL {level}</span>
              </div>
              <Button asChild variant="ghost" size="icon" className="hidden sm:flex text-muted-foreground hover:text-white">
                <Link href="/search" aria-label="Search">
                  <Search className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-white relative">
                <Link href="/notifications" aria-label="Notifications">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-4 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-black flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : (
                    <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                </Link>
              </Button>
              <Link href="/profile" aria-label="Profile">
                <UserAvatar
                  src={userData?.photoURL || userData?.avatarUrl}
                  name={userData?.name}
                  size="sm"
                  className="border-primary/30 blue-glow"
                />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/open" className="hidden sm:block">
                <Button variant="ghost" className="text-sm font-bold hover:text-primary transition-colors">
                  Join
                </Button>
              </Link>
              <Link href="/login">
                <Button className="rounded-full px-6 py-5 bg-primary hover:bg-primary/90 text-sm font-bold blue-glow group">
                  Enter The Community
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </motion.span>
                </Button>
              </Link>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-2xl border-b border-white/10 overflow-hidden"
          >
            <div className="flex flex-col p-6 gap-6">
              {links.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "text-lg font-bold transition-colors",
                    pathname === link.href ? "text-primary" : "text-white/70"
                  )}
                >
                  {link.name}
                </Link>
              ))}
              <hr className="border-white/5" />
              {!isLoggedIn && (
                <div className="flex flex-col gap-3">
                  <Link href="/open" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full border-white/10 py-6 rounded-2xl text-lg font-bold">
                      Join Now
                    </Button>
                  </Link>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-primary py-6 rounded-2xl text-lg font-bold blue-glow">
                      Enter The Community
                    </Button>
                  </Link>
                </div>
              )}
              {isLoggedIn && (
                <div className="hidden lg:flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-primary uppercase tracking-tighter">Level {level}</span>
                    <span className="text-xs font-bold font-headline">{xp} XP</span>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 blue-glow">
                    <Trophy className="w-4 h-4 text-primary" />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

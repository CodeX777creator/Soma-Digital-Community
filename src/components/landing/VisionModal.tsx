"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Loader2, Sparkles, Zap, Cpu, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface VisionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VisionModal = ({ isOpen, onClose }: VisionModalProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setShowContent(false);

      const timer = setTimeout(() => {
        setIsLoading(false);
        setTimeout(() => setShowContent(true), 500);
      }, 2500); // Cinematic intro duration

      // Handle ESC key
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleEsc);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", handleEsc);
      };
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl"
        >
          {/* Ambient Glows */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 blur-[120px] rounded-full animate-pulse animation-delay-2000" />
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors z-[210] group"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-0 group-hover:opacity-100 transition-opacity">Close Vision</span>
              <X className="w-8 h-8" />
            </div>
          </button>

          <div className="w-full max-w-6xl aspect-video relative z-[205] px-6">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loader"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-8"
                >
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                      className="w-32 h-32 rounded-full border-t-2 border-primary blue-glow"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu className="w-8 h-8 text-primary animate-pulse" />
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: 200 }}
                      className="h-1 bg-primary/20 rounded-full overflow-hidden"
                    >
                      <motion.div
                        animate={{ x: [-200, 200] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="h-full w-20 bg-primary blue-glow"
                      />
                    </motion.div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-primary animate-pulse">Initializing Vision Engine</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="video"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full h-full rounded-[2rem] border border-white/10 overflow-hidden bg-black shadow-2xl relative group"
                >
                  {/* Dynamic Video Placeholder / Content */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />

                  {/* Visual Content Placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src="/images/media__1778932995945.png"
                      alt="Vision Preview"
                      className="w-full h-full object-cover opacity-60 scale-105 group-hover:scale-100 transition-transform duration-10000"
                      data-ai-hint="futuristic tech landscape with glowing nodes"
                    />
                  </div>

                  {/* Narration Overlay */}
                  <div className="absolute bottom-12 left-12 right-12 z-20 space-y-6">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 mb-4 font-mono">
                        CHAPTER 01: THE AWAKENING
                      </Badge>
                      <h2 className="text-4xl md:text-6xl font-bold font-headline leading-tight">
                        A Future Built <br /> <span className="text-gradient">By Entrepreneurs.</span>
                      </h2>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-white/10"
                    >
                      <div className="flex gap-4">
                        <Zap className="w-6 h-6 text-primary shrink-0" />
                        <div>
                          <p className="font-bold text-sm">Founder Narration</p>
                          <p className="text-xs text-muted-foreground">The story of SOMA DS.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <Globe className="w-6 h-6 text-accent shrink-0" />
                        <div>
                          <p className="font-bold text-sm">Global Network</p>
                          <p className="text-xs text-muted-foreground">Connecting the builders.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <Sparkles className="w-6 h-6 text-purple-400 shrink-0" />
                        <div>
                          <p className="font-bold text-sm">AI Future</p>
                          <p className="text-xs text-muted-foreground">Scaling human potential.</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Playback Controls Placeholder */}
                  <div className="absolute bottom-6 right-6 z-30 flex items-center gap-4">
                    <div className="h-1 w-48 bg-white/10 rounded-full overflow-hidden hidden md:block">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "40%" }}
                        transition={{ duration: 10, ease: "linear" }}
                        className="h-full bg-primary"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-white/40">02:40 / 08:00</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


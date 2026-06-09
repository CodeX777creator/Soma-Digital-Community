"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactionType } from "@/lib/db";
import { cn } from "@/lib/utils";

export const REACTIONS: { type: ReactionType; emoji: string; label: string; color: string }[] = [
  { type: "like",   emoji: "👍", label: "Like",   color: "text-blue-400"   },
  { type: "love",   emoji: "❤️", label: "Love",   color: "text-red-400"    },
  { type: "funny",  emoji: "😂", label: "Haha",   color: "text-yellow-400" },
  { type: "wow",    emoji: "😮", label: "Wow",    color: "text-orange-400" },
  { type: "sad",    emoji: "😢", label: "Sad",    color: "text-indigo-400" },
  { type: "fire",   emoji: "🔥", label: "Fire",   color: "text-orange-500" },
];

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (type: ReactionType) => void;
}

export function ReactionPicker({ visible, onSelect }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="absolute bottom-full left-0 mb-2 z-50"
        >
          <div className="flex items-center gap-1 bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 shadow-2xl shadow-black/50">
            {REACTIONS.map((r, i) => (
              <motion.button
                key={r.type}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 500, damping: 20 }}
                whileHover={{ scale: 1.5, y: -6 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(r.type);
                }}
                className="relative group/reaction flex flex-col items-center"
                title={r.label}
              >
                <span className="text-2xl leading-none select-none">{r.emoji}</span>
                {/* Label tooltip */}
                <motion.span
                  initial={{ opacity: 0, y: 2 }}
                  whileHover={{ opacity: 1, y: 0 }}
                  className={cn(
                    "absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                    "bg-black/80 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover/reaction:opacity-100 transition-opacity",
                    r.color
                  )}
                >
                  {r.label}
                </motion.span>
              </motion.button>
            ))}
          </div>
          {/* Arrow */}
          <div className="w-3 h-3 bg-[#0d1117] border-b border-r border-white/10 rotate-45 ml-4 -mt-1.5" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

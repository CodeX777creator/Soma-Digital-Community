"use client";

import { motion } from "framer-motion";
import { Cpu } from "lucide-react";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,183,255,0.15),transparent_50%)]" />
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1], 
            opacity: [0.5, 1, 0.5],
            rotate: [0, 180, 360]
          }}
          transition={{ 
            duration: 3, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="w-24 h-24 rounded-full bg-cyan-500/10 flex items-center justify-center mb-8 border border-cyan-500/20"
        >
          <Cpu className="w-10 h-10 text-cyan-400" />
        </motion.div>
        
        <motion.p 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-cyan-400/80 tracking-widest text-sm uppercase"
        >
          Loading Experience
        </motion.p>
        
        <div className="mt-8 flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ 
                height: [8, 24, 8],
                opacity: [0.3, 1, 0.3]
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                delay: i * 0.2,
                ease: "easeInOut"
              }}
              className="w-1.5 bg-cyan-500/50 rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

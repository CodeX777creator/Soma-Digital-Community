"use client";

import React from "react";
import { Navbar } from "./Navbar";

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="animated-bg">
        <div className="glow-particle w-[400px] h-[400px] bg-primary top-[-10%] left-[-5%] animate-pulse-glow" />
        <div className="glow-particle w-[500px] h-[500px] bg-accent bottom-[-20%] right-[-10%] animate-pulse-glow" style={{ animationDelay: '2s' }} />
        <div className="glow-particle w-[300px] h-[300px] bg-purple-600 top-[30%] right-[15%] animate-pulse-glow" style={{ animationDelay: '1s', opacity: 0.1 }} />
      </div>
      <Navbar />
      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

"use client";

import React from "react";
import { Navbar } from "./Navbar";
import { GrowthEngine } from "../growth-engine/GrowthEngine";

export const AppLayout = ({ children }: React.PropsWithChildren) => {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="animated-bg">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="glow-particle w-[400px] h-[400px] bg-primary top-[-10%] left-[-5%] animate-pulse-glow" />
        <div className="glow-particle w-[500px] h-[500px] bg-accent bottom-[-20%] right-[-10%] animate-pulse-glow animation-delay-2000" />
        <div className="glow-particle w-[300px] h-[300px] bg-purple-600 top-[30%] right-[15%] animate-pulse-glow animation-delay-1000 opacity-10" />
      </div>
      <Navbar />
      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
      <GrowthEngine />
    </div>
  );
};

"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ComingSoonTemplate } from "../components/ComingSoonTemplate";
import { Target } from "lucide-react";

export default function StrategyToolPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <ComingSoonTemplate
          icon={<Target className="w-10 h-10" />}
          title="Strategy Builder"
          tagline="Transform your ideas into actionable business strategies"
          description="Strategy Builder is an AI-powered workspace designed to help founders and entrepreneurs develop comprehensive business strategies. Whether you're launching a new product, entering a new market, or pivoting your business model, Strategy Builder guides you through proven frameworks like Business Model Canvas, SWOT analysis, and go-to-market planning. With AI assistance, you'll get personalized recommendations based on your industry, goals, and resources."
          features={[
            "Interactive Business Model Canvas with AI suggestions",
            "SWOT analysis with competitive intelligence",
            "Go-to-market strategy templates",
            "Financial projection modeling",
            "AI strategy coach for real-time feedback",
            "Export to PDF, PowerPoint, or Notion",
            "Collaborate with team members",
            "Strategy version history & iteration tracking",
          ]}
          useCases={[
            "Plan your MVP launch with step-by-step guidance",
            "Analyze competitors and find your unique positioning",
            "Create investor-ready pitch decks from your strategy",
            "Validate business ideas before investing time & money",
          ]}
          estimatedRelease="Phase 2 - Q3 2026"
          tier="explorer"
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

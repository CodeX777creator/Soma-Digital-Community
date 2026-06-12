"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ComingSoonTemplate } from "../components/ComingSoonTemplate";
import { Search } from "lucide-react";

export default function InsightsToolPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <ComingSoonTemplate
          icon={<Search className="w-10 h-10" />}
          title="Insights"
          tagline="Data-driven decisions for exponential growth"
          description="Insights is an advanced analytics platform that helps you understand your performance, identify growth opportunities, and make data-driven decisions. Track your XP growth, analyze community engagement, benchmark against top performers, and get AI-powered recommendations for improvement. Elite members get exclusive access to predictive analytics and custom report building."
          features={[
            "Personal performance dashboard with XP analytics",
            "Community engagement metrics & reach tracking",
            "Benchmarking against top 10% performers",
            "ROI tracking for time invested vs outcomes",
            "Custom dashboard builder with widgets",
            "Trend analysis & growth pattern detection",
            "AI-powered recommendations for improvement",
            "Automated weekly & monthly performance reports",
          ]}
          useCases={[
            "Identify which activities drive the most growth",
            "Track your community influence over time",
            "Compare your progress to similar founders",
            "Generate investor-ready performance reports",
          ]}
          estimatedRelease="Phase 2 - Q4 2026"
          tier="elite"
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

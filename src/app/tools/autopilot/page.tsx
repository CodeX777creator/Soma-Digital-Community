"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ComingSoonTemplate } from "../components/ComingSoonTemplate";
import { Zap } from "lucide-react";

export default function AutopilotToolPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <ComingSoonTemplate
          icon={<Zap className="w-10 h-10" />}
          title="Autopilot"
          tagline="Put your growth on autopilot with intelligent automation"
          description="Autopilot is a powerful workflow automation platform built specifically for digital entrepreneurs. Create custom workflows that trigger actions based on events, schedule content across platforms, and automate repetitive tasks. Save 10+ hours per week by letting Autopilot handle your routine growth activities while you focus on high-impact work."
          features={[
            "Visual workflow builder with drag-and-drop interface",
            "Pre-built automation templates for common tasks",
            "Scheduled posting to social media & community",
            "Smart trigger conditions (IF this, THEN that)",
            "Automated follow-up sequences",
            "Integration with 50+ platforms",
            "A/B testing for automation workflows",
            "Detailed analytics on automation performance",
          ]}
          useCases={[
            "Auto-post daily wins to community when missions completed",
            "Send personalized follow-up DMs to new connections",
            "Schedule content calendar across all platforms",
            "Trigger email sequences when leads take specific actions",
          ]}
          estimatedRelease="Phase 2 - Q3 2026"
          tier="pro"
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

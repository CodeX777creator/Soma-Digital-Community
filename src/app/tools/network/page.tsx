"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ComingSoonTemplate } from "../components/ComingSoonTemplate";
import { Users } from "lucide-react";

export default function NetworkToolPage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <ComingSoonTemplate
          icon={<Users className="w-10 h-10" />}
          title="Network CRM"
          tagline="Turn connections into collaborations"
          description="Network CRM is your personal relationship management system designed specifically for founders. Track your connections, manage outreach pipelines, and never lose touch with valuable contacts. From cold outreach to warm introductions, Network CRM helps you systematically build the relationships that grow your business."
          features={[
            "Contact management with rich profiles & notes",
            "Visual pipeline stages (Cold → Warm → Active → Partner)",
            "Message templates for different outreach scenarios",
            "Smart follow-up reminders based on last contact",
            "Import contacts from LinkedIn & other platforms",
            "Tagging & segmentation for targeted outreach",
            "Conversation history across all channels",
            "Deal flow tracking for investment opportunities",
          ]}
          useCases={[
            "Track potential investors through your funding pipeline",
            "Manage strategic partnership opportunities",
            "Systematically follow up with conference contacts",
            "Organize your mentor & advisor relationships",
          ]}
          estimatedRelease="Phase 2 - Q4 2026"
          tier="pro"
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

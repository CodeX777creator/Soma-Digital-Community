import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";

export default function CaseStudiesPage() {
  return (
    <AppLayout>
      <GlassCard className="max-w-3xl mx-auto p-10">
        <h1 className="text-4xl font-bold font-headline">Case Studies</h1>
        <p className="text-muted-foreground mt-4">Customer stories will appear here once verified results are available.</p>
      </GlassCard>
    </AppLayout>
  );
}

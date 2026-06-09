import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";

export default function PartnersPage() {
  return (
    <AppLayout>
      <GlassCard className="max-w-3xl mx-auto p-10">
        <h1 className="text-4xl font-bold font-headline">Partner Program</h1>
        <p className="text-muted-foreground mt-4">Partnership details are being prepared.</p>
      </GlassCard>
    </AppLayout>
  );
}

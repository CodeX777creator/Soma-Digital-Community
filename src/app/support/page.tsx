import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";

export default function SupportPage() {
  return (
    <AppLayout>
      <GlassCard className="max-w-3xl mx-auto p-10">
        <h1 className="text-4xl font-bold font-headline">Support Center</h1>
        <p className="text-muted-foreground mt-4">For help, contact the Soma Digital team through your community channel.</p>
      </GlassCard>
    </AppLayout>
  );
}

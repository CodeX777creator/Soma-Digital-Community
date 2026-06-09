import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";

export default function BlogPage() {
  return (
    <AppLayout>
      <GlassCard className="max-w-3xl mx-auto p-10">
        <h1 className="text-4xl font-bold font-headline">Founders Blog</h1>
        <p className="text-muted-foreground mt-4">Articles will appear here when they are published.</p>
      </GlassCard>
    </AppLayout>
  );
}

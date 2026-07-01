import { DashboardSkeleton } from "@/components/loading/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-black p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <DashboardSkeleton />
      </div>
    </div>
  );
}

import { CommunitySkeleton } from "@/components/loading/Skeleton";

export default function CommunityLoading() {
  return (
    <div className="min-h-screen bg-black p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <CommunitySkeleton />
      </div>
    </div>
  );
}

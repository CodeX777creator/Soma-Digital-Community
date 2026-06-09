"use client";

import { useEffect } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SignupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    router.replace(params ? `/open?${params}` : "/open");
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-primary animate-pulse">
      Loading your setup...
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black text-primary animate-pulse">Loading your setup...</div>}>
      <SignupRedirect />
    </Suspense>
  );
}

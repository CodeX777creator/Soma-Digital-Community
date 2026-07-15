"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";

async function academyFetch(path: string) {
  const token = await auth?.currentUser?.getIdToken();
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Academy request failed.");
  return payload;
}

export default function AcademyLearnRedirectPage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const bundle = await academyFetch(`/api/academy/${courseSlug}`);
      const firstLesson = bundle.lessons?.find((lesson: any) => lesson.status === "published");
      router.replace(firstLesson ? `/academy/${courseSlug}/learn/${firstLesson.lessonId}` : `/academy/${courseSlug}`);
    };
    void load();
  }, [courseSlug, router]);

  return <div className="flex min-h-screen items-center justify-center bg-[#090B13] text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening learning room</div>;
}

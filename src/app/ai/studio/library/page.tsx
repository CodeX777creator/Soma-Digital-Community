"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/clientApi";
import { STUDIO_CONTENT_TYPES, type StudioContentType, type StudioPromptLibraryEntry } from "@/ai/studio/types";
import { ArrowRight, FileText, LibraryBig, Search, Sparkles } from "lucide-react";

type LibraryResponse = {
  supportedContentTypes: readonly StudioContentType[];
  promptLibrary: StudioPromptLibraryEntry[];
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

export default function StudioLibraryPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StudioContentType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState<LibraryResponse>({
    supportedContentTypes: STUDIO_CONTENT_TYPES,
    promptLibrary: [],
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await authFetch("/api/ai/studio?limit=1");
        if (!response.ok) throw new Error("Could not load reusable templates.");
        const payload = (await response.json()) as LibraryResponse;
        if (mounted) {
          setLibrary({
            supportedContentTypes: payload.supportedContentTypes || STUDIO_CONTENT_TYPES,
            promptLibrary: payload.promptLibrary || [],
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPrompts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return library.promptLibrary.filter((entry) => {
      const typeMatch = typeFilter === "all" || entry.id === typeFilter;
      const searchMatch =
        !term ||
        [entry.title, entry.description, entry.id, ...entry.tags, ...entry.recommendedFor].join(" ").toLowerCase().includes(term);
      return typeMatch && searchMatch;
    });
  }, [library.promptLibrary, search, typeFilter]);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <section className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#8B5CF6]/25 bg-[#8B5CF6]/10 px-3 py-1 text-xs text-[#BFC6D4]">
                  <LibraryBig className="h-3.5 w-3.5 text-[#8B5CF6]" />
                  Studio Library
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">Reusable templates</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#BFC6D4]">
                  Start from proven content structures, then send the template into AI Studio with the right format already selected.
                </p>
              </div>
              <Button asChild className="rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]">
                <Link href="/ai/studio">
                  <Sparkles className="h-4 w-4" />
                  Open command center
                </Link>
              </Button>
            </div>
          </section>

          <GlassCard className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative md:w-96">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search social, email, blog, video..." className="pl-9" />
              </div>
              <select
                aria-label="Template content type"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as StudioContentType | "all")}
              >
                <option value="all">All types</option>
                {library.supportedContentTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatContentType(type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {filteredPrompts.map((entry) => (
                <div key={entry.id} className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#4F9DFF]" />
                        <h2 className="text-base font-medium text-white">{entry.title}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">{entry.description}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]">
                      {formatContentType(entry.id)}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-[#BFC6D4]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button asChild className="mt-5 rounded-2xl">
                    <Link
                      href={`/ai/studio?${new URLSearchParams({
                        source: "library",
                        contentType: entry.id,
                        goal: entry.description,
                      }).toString()}`}
                    >
                      Start from this
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {!loading && filteredPrompts.length === 0 ? (
              <div className="mt-5 rounded-[18px] border border-dashed border-white/[0.1] p-8 text-sm text-[#BFC6D4]">
                No reusable templates match this search.
              </div>
            ) : null}
          </GlassCard>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

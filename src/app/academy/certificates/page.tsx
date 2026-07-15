"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { auth } from "@/lib/firebase";
import type { AcademyCertificateDoc } from "@/academy";

async function academyFetch(path: string) {
  const token = await auth?.currentUser?.getIdToken();
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Academy request failed.");
  return payload;
}

export default function AcademyCertificatesPage() {
  const [certificates, setCertificates] = useState<AcademyCertificateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const payload = await academyFetch("/api/academy/certificates");
        setCertificates(Array.isArray(payload.certificates) ? payload.certificates : []);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <section className="rounded-[22px] border border-white/[0.08] bg-[#151A2E]/72 p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <Award className="h-3.5 w-3.5" />
              Certificates
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Your Academy certificates</h1>
            <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">Completed certifications and public verification links will appear here.</p>
          </section>
          {loading ? <div className="flex justify-center py-12 text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading certificates</div> : null}
          {!loading && certificates.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {certificates.map((certificate) => (
                <Link key={certificate.certificateId} href={`/certificates/verify/${certificate.certificateId}`} className="rounded-[20px] border border-white/[0.08] bg-[#151A2E]/72 p-5 transition hover:bg-white/[0.06]">
                  <ShieldCheck className="h-6 w-6 text-[#22C55E]" />
                  <h2 className="mt-4 font-semibold text-white">{certificate.courseTitle}</h2>
                  <p className="mt-1 text-sm text-[#BFC6D4]">Score {certificate.score}% · {certificate.status}</p>
                  <p className="mt-4 flex items-center gap-2 text-sm text-white">Verify <ExternalLink className="h-4 w-4" /></p>
                </Link>
              ))}
            </div>
          ) : null}
          {!loading && !certificates.length ? <div className="rounded-[22px] border border-dashed border-white/[0.08] bg-[#151A2E]/40 p-10 text-center text-[#BFC6D4]">Certificates will appear after you pass a final Academy exam.</div> : null}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

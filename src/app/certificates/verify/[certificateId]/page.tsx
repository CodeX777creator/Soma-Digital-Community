"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Award, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type { AcademyCertificateDoc } from "@/academy";

export default function CertificateVerifyPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [certificate, setCertificate] = useState<AcademyCertificateDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/academy/certificates/verify/${certificateId}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Certificate not found.");
        setCertificate(payload.certificate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Certificate not found.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [certificateId]);

  return (
    <main className="min-h-screen bg-[#090B13] px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-[#BFC6D4] hover:text-white">Soma Digital Community</Link>
        <section className="mt-8 rounded-[28px] border border-white/[0.08] bg-[#151A2E]/72 p-8 shadow-[0_30px_90px_rgba(0,0,0,.38)]">
          {loading ? <div className="flex items-center justify-center py-20 text-[#BFC6D4]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying certificate</div> : null}
          {!loading && certificate ? (
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]"><Award className="h-10 w-10" /></div>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4" /> Verified Certificate</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight">{certificate.courseTitle}</h1>
              <p className="mt-3 text-[#BFC6D4]">Awarded to</p>
              <p className="mt-2 text-2xl font-semibold">{certificate.studentName}</p>
              <div className="mt-8 grid gap-3 rounded-[20px] border border-white/[0.08] bg-[#090B13]/55 p-5 text-left sm:grid-cols-2">
                <Detail label="Score" value={`${certificate.score}%`} />
                <Detail label="Status" value={certificate.status} />
                <Detail label="Verification code" value={certificate.verificationCode} />
                <Detail label="Certificate ID" value={certificate.certificateId} />
              </div>
            </div>
          ) : null}
          {!loading && error ? <div className="py-16 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-white/30" /><h1 className="mt-4 text-2xl font-semibold">Certificate not verified</h1><p className="mt-2 text-[#BFC6D4]">{error}</p></div> : null}
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-[0.18em] text-[#7E8799]">{label}</p><p className="mt-1 break-all text-sm text-white">{value}</p></div>;
}

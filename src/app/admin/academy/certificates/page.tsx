import { Award, BadgeCheck, ShieldCheck } from "lucide-react";

export default function AdminAcademyCertificatesPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-white/[0.055] to-cyan-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Certificates</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Certification registry</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Monitor issued certificates, verification codes, revocations, course completion score, and public verification health.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Award} label="Issued" value="0" />
        <Metric icon={BadgeCheck} label="Active" value="0" />
        <Metric icon={ShieldCheck} label="Verified" value="0" />
      </div>
      <section className="rounded-3xl border border-dashed border-white/10 bg-[#0d1018] p-8 text-sm text-white/50">Certificate records will populate from `academyCertificates` after final exam and certificate issuance are implemented.</section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><Icon className="h-5 w-5 text-cyan-200" /><p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}

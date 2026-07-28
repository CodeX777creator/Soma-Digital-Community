"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LifeBuoy, Loader2, Mail, MessageSquare, Plus, Send } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { auth } from "@/lib/firebase";
import { SITE_CONFIG } from "@/lib/config";

type Ticket = { ticketId: string; subject: string; category: string; priority: string; status: string; message: string; updatedAt?: string };
type TicketDetail = Ticket & { messages: Array<{ messageId: string; message: string; authorRole: string; createdAt?: string }> };

async function supportFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in to use support tickets.");
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Support request failed.");
  return payload;
}

export default function SupportPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("technical");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => { if (!auth) return; return onAuthStateChanged(auth, (nextUser) => setUser(nextUser)); }, []);
  useEffect(() => { if (!user) return; setLoading(true); void supportFetch("/api/support/tickets").then((payload) => setTickets(payload.tickets || [])).catch((err) => setError(err instanceof Error ? err.message : "Unable to load tickets.")).finally(() => setLoading(false)); }, [user]);

  const openTicket = async (ticketId: string) => {
    try { const payload = await supportFetch(`/api/support/tickets/${ticketId}`); setSelected(payload.ticket); } catch (err) { setError(err instanceof Error ? err.message : "Unable to open ticket."); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { setSaving(true); setError(""); const payload = await supportFetch("/api/support/tickets", { method: "POST", body: JSON.stringify({ subject, category, priority, message }) }); setSubject(""); setMessage(""); setNotice("Your support ticket has been submitted."); const list = await supportFetch("/api/support/tickets"); setTickets(list.tickets || []); await openTicket(payload.ticketId); } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit ticket."); } finally { setSaving(false); }
  };
  const submitReply = async (event: FormEvent) => { event.preventDefault(); if (!selected) return; try { setSaving(true); await supportFetch(`/api/support/tickets/${selected.ticketId}`, { method: "POST", body: JSON.stringify({ message: reply }) }); setReply(""); await openTicket(selected.ticketId); } catch (err) { setError(err instanceof Error ? err.message : "Unable to send reply."); } finally { setSaving(false); } };

  return <AppLayout><div className="mx-auto max-w-6xl space-y-8"><header className="space-y-4"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Support Center</p><h1 className="text-4xl font-bold font-headline text-white sm:text-5xl">Get help without losing the thread.</h1><p className="max-w-2xl text-base leading-7 text-muted-foreground">Create a support ticket, follow replies, and keep billing, Academy, AI, social, and technical questions in one place.</p></header>{error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}{notice ? <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p> : null}{!user ? <GlassCard className="max-w-2xl p-7"><LifeBuoy className="h-8 w-8 text-cyan-300" /><h2 className="mt-4 text-2xl font-semibold text-white">Sign in to open a ticket</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">You can still email us directly, but signing in lets you track replies and status.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/login?next=%2Fsupport" className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-black">Sign in</Link><a href={`mailto:${SITE_CONFIG.supportEmail}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/75"><Mail className="h-4 w-4" />{SITE_CONFIG.supportEmail}</a></div></GlassCard> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><GlassCard className="p-6"><div className="flex items-center gap-3"><Plus className="h-5 w-5 text-cyan-300" /><h2 className="text-xl font-semibold text-white">Open a support ticket</h2></div><form onSubmit={submit} className="mt-5 space-y-4"><input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What do you need help with?" className="support-input" /><div className="grid gap-4 sm:grid-cols-2"><select value={category} onChange={(event) => setCategory(event.target.value)} className="support-input"><option value="technical">Technical issue</option><option value="account">Account</option><option value="billing">Billing</option><option value="ai">AI tools</option><option value="academy">Academy</option><option value="marketplace">Marketplace</option><option value="social">Social publishing</option><option value="other">Other</option></select><select value={priority} onChange={(event) => setPriority(event.target.value)} className="support-input"><option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option></select></div><textarea required value={message} onChange={(event) => setMessage(event.target.value)} rows={8} placeholder="Describe what happened, what you expected, and any useful reference number." className="support-input resize-y" /><button disabled={saving || !subject.trim() || !message.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-black disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit ticket</button></form></GlassCard><GlassCard className="p-5"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-cyan-300" /><h2 className="font-semibold text-white">Your tickets</h2></div>{loading ? <p className="mt-5 text-sm text-white/45">Loading tickets...</p> : !tickets.length ? <p className="mt-5 text-sm leading-6 text-white/45">No tickets yet. Open one and replies will appear here.</p> : <div className="mt-4 space-y-2">{tickets.map((ticket) => <button key={ticket.ticketId} type="button" onClick={() => void openTicket(ticket.ticketId)} className={`w-full rounded-xl border p-3 text-left ${selected?.ticketId === ticket.ticketId ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}><p className="line-clamp-2 text-sm font-semibold text-white">{ticket.subject}</p><p className="mt-2 text-xs uppercase tracking-wider text-white/40">{ticket.status.replaceAll("_", " ")} · {ticket.priority}</p></button>)}</div>}</GlassCard></div>}{selected ? <GlassCard className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Ticket conversation</p><h2 className="mt-2 text-2xl font-semibold text-white">{selected.subject}</h2></div><span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-wider text-cyan-200">{selected.status.replaceAll("_", " ")}</span></div><div className="mt-6 space-y-3">{selected.messages.map((item) => <div key={item.messageId} className={`rounded-xl border p-4 ${item.authorRole === "admin" ? "border-cyan-300/20 bg-cyan-300/5" : "border-white/10 bg-black/15"}`}><p className="mb-2 text-xs uppercase tracking-wider text-white/40">{item.authorRole === "admin" ? "SDC Support" : "You"}</p><p className="whitespace-pre-wrap text-sm leading-6 text-white/75">{item.message}</p></div>)}</div>{!(["resolved", "closed"].includes(selected.status)) ? <form onSubmit={submitReply} className="mt-6 flex flex-col gap-3 sm:flex-row"><textarea required value={reply} onChange={(event) => setReply(event.target.value)} rows={3} placeholder="Reply to support..." className="support-input min-h-20 flex-1 resize-y" /><button disabled={saving || !reply.trim()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-black disabled:opacity-50"><Send className="h-4 w-4" />Reply</button></form> : <p className="mt-5 text-sm text-white/45">This ticket is closed.</p>}</GlassCard> : null}<style jsx global>{`.support-input{min-height:2.75rem;width:100%;border-radius:.8rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.24);padding:.75rem .85rem;color:white;outline:none}.support-input:focus{border-color:rgba(34,211,238,.55)}.support-input::placeholder{color:rgba(255,255,255,.34)}.support-input option{background:#0b0e14;color:white}`}</style></div></AppLayout>;
}

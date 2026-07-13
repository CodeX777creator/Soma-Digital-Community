"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { ArrowRight, CheckCircle2, Cpu, Loader2, Lock, Mail, ShieldAlert, XCircle } from "lucide-react";
import { auth } from "@/lib/firebase";
import { dbService } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { validatePassword } from "@/lib/utils";

type ActionState = "loading" | "ready" | "success" | "error";

function modeLabel(mode: string | null) {
  switch (mode) {
    case "resetPassword":
      return "Reset your password";
    case "verifyEmail":
      return "Verify your email";
    case "recoverEmail":
      return "Recover your email";
    case "verifyAndChangeEmail":
      return "Confirm your new email";
    default:
      return "Account action";
  }
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("auth/expired-action-code")) return "This link has expired. Please request a new email and try again.";
  if (message.includes("auth/invalid-action-code")) return "This link is invalid or has already been used.";
  if (message.includes("auth/user-disabled")) return "This account has been disabled. Please contact support.";
  if (message.includes("auth/user-not-found")) return "We could not find an account for this link.";
  if (message.includes("auth/weak-password")) return "Please choose a stronger password.";
  return message || "We could not complete this action. Please request a fresh link and try again.";
}

function AuthActionContent() {
  const params = useSearchParams();
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");
  const continueUrl = params.get("continueUrl");
  const [state, setState] = useState<ActionState>("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const safeContinueUrl = useMemo(() => {
    if (!continueUrl) return "/login";
    try {
      const parsed = new URL(continueUrl, window.location.origin);
      if (parsed.origin !== window.location.origin) return "/login";
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "/login";
    }
  }, [continueUrl]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth) {
        setState("error");
        setMessage("Authentication is not initialized. Please refresh and try again.");
        return;
      }

      if (!mode || !oobCode) {
        setState("error");
        setMessage("This account link is missing required information.");
        return;
      }

      try {
        if (mode === "resetPassword") {
          const verifiedEmail = await verifyPasswordResetCode(auth, oobCode);
          if (cancelled) return;
          setEmail(verifiedEmail);
          setState("ready");
          setMessage("Choose a new password for your Soma Digital Community account.");
          return;
        }

        if (mode === "verifyEmail" || mode === "verifyAndChangeEmail") {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);

          const currentUser = auth.currentUser;
          if (currentUser) {
            await currentUser.reload();
            if (currentUser.emailVerified) {
              await dbService.saveUserProfile(currentUser.uid, {
                emailVerified: true,
                onboardingComplete: true,
              });
            }
          }

          if (cancelled) return;
          setEmail(info.data.email || info.data.previousEmail || "");
          setState("success");
          setMessage(mode === "verifyAndChangeEmail" ? "Your new email has been confirmed." : "Your email has been verified.");
          return;
        }

        if (mode === "recoverEmail") {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setEmail(info.data.previousEmail || info.data.email || "");
          setState("success");
          setMessage("Your previous email has been restored. You can sign in again from the login page.");
          return;
        }

        setState("error");
        setMessage("This account action is not supported.");
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setMessage(friendlyError(error));
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth || !oobCode) return;

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Both passwords must match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setState("success");
      setMessage("Your password has been updated. You can now sign in.");
      toast({ title: "Password updated", description: "Your Soma Digital Community password has been reset." });
    } catch (error) {
      setState("error");
      setMessage(friendlyError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = state === "success" ? CheckCircle2 : state === "error" ? XCircle : mode === "resetPassword" ? Lock : Mail;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090B13] px-6 py-12 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(91,95,255,.22),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(79,157,255,.16),transparent_28%),linear-gradient(135deg,rgba(17,24,39,.8),rgba(9,11,19,.95))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <section className="relative z-10 w-full max-w-lg rounded-[18px] border border-white/10 bg-white/[0.055] p-8 shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] shadow-lg shadow-indigo-500/25">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-white/50">Soma Digital Community</p>
            <h1 className="text-2xl font-semibold tracking-tight">{modeLabel(mode)}</h1>
          </div>
        </div>

        <div className="mb-6 flex items-start gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <Icon className={`mt-1 h-5 w-5 ${state === "success" ? "text-emerald-400" : state === "error" ? "text-red-400" : "text-cyan-300"}`} />
          <div>
            <p className="font-medium">
              {state === "loading" ? "Checking your secure link" : state === "ready" ? "Link confirmed" : state === "success" ? "Action complete" : "Action needs attention"}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/60">{message || "Please wait while we verify this request."}</p>
            {email && <p className="mt-2 text-sm text-cyan-200">{email}</p>}
          </div>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            Securing your account action...
          </div>
        )}

        {state === "ready" && mode === "resetPassword" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-white/60">New password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                className="h-12 rounded-xl border-white/10 bg-black/25 text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-white/60">Confirm password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                className="h-12 rounded-xl border-white/10 bg-black/25 text-white"
              />
            </div>
            <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] font-semibold text-white">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
              Reset password
            </Button>
          </form>
        )}

        {(state === "success" || state === "error") && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] text-white">
              <Link href={state === "success" ? safeContinueUrl : "/login"}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 flex-1 rounded-xl border-white/10 bg-black/20 text-white hover:bg-white/10">
              <Link href="/support">Get help</Link>
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-white/35">
          This secure link is managed by Firebase Authentication and branded by Soma Digital Community.
        </p>
      </section>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#090B13] text-white">Loading secure action...</main>}>
      <AuthActionContent />
    </Suspense>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  Auth,
  AuthError,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { doc, Firestore, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type AuthStatus = "checking" | "idle" | "submitting" | "unauthorized";

const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

function getAuthErrorMessage(error: unknown) {
  const code = (error as AuthError | undefined)?.code;

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password is incorrect.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    case "auth/popup-blocked":
      return "Popup was blocked. Please allow popups for this site or try again.";
    case "auth/cancelled-popup-request":
      return "Multiple popup requests detected. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Unable to sign in. Please try again.";
  }
}

function hasAdminAccess(profile: Record<string, any> | undefined) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === "admin" || roles.includes("admin");
}

export default function AdminLoginPage() {
  const router = useRouter();
  const redirectingRef = useRef(false);
  const checkingUidRef = useRef<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const isBusy = status === "checking" || status === "submitting";

  const statusMessage = useMemo(() => {
    if (status === "checking") return "Verifying admin access";
    if (status === "submitting") return "Checking credentials";
    if (status === "unauthorized") return "Unauthorized";
    return "Secure administrator access";
  }, [status]);

  const verifyAdmin = async (user: User) => {
    if (redirectingRef.current || checkingUidRef.current === user.uid) return;

    checkingUidRef.current = user.uid;
    setStatus("checking");
    setError(null);

    try {
      const userSnap = await getDoc(doc(db as Firestore, "users", user.uid));
      const profile = userSnap.exists() ? userSnap.data() : undefined;

      if (!hasAdminAccess(profile)) {
        await signOut(auth as Auth);
        setStatus("unauthorized");
        setError("Unauthorized. This account does not have admin access.");
        return;
      }

      redirectingRef.current = true;
      router.replace(ADMIN_DASHBOARD_PATH);
    } catch {
      await signOut(auth as Auth);
      setStatus("idle");
      setError("Unable to verify admin access. Please try again.");
    } finally {
      checkingUidRef.current = null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth as Auth, async (user) => {
      if (!user) {
        if (!redirectingRef.current && status === "checking") {
          setStatus("idle");
        }
        return;
      }

      await verifyAdmin(user);
    });

    return () => unsubscribe();
  }, [status]);

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const credential = await signInWithEmailAndPassword(
        auth as Auth,
        email.trim(),
        password
      );
      await verifyAdmin(credential.user);
    } catch (err) {
      setStatus("idle");
      setError(getAuthErrorMessage(err));
    }
  };

  const handleGoogleLogin = async () => {
    setStatus("submitting");
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      
      let credential;
      try {
        credential = await signInWithPopup(auth as Auth, provider);
      } catch (popupErr: any) {
        // If popup is blocked or fails due to COOP/COEP, fall back to redirect
        if (popupErr.code === 'auth/popup-blocked' || 
            popupErr.code === 'auth/cancelled-popup-request' ||
            popupErr.message?.includes('Cross-Origin-Opener-Policy')) {
          await signInWithRedirect(auth as Auth, provider);
          return;
        }
        throw popupErr;
      }
      
      await verifyAdmin(credential.user);
    } catch (err) {
      console.error("Google sign-in error:", err);
      setStatus("idle");
      setError(getAuthErrorMessage(err));
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,183,255,0.08),transparent_48%)]" />
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute w-[720px] h-[720px] bg-cyan-500 rounded-full blur-[140px] top-[-28%] left-[-18%] opacity-20 animate-pulse" />
        <div className="absolute w-[560px] h-[560px] bg-blue-500 rounded-full blur-[140px] bottom-[-22%] right-[-12%] opacity-20 animate-pulse animation-delay-2000" />
        <div className="absolute w-[420px] h-[420px] bg-violet-500 rounded-full blur-[140px] top-[12%] right-[8%] opacity-10 animate-pulse animation-delay-4000" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <header className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
            <ShieldCheck className="w-8 h-8 text-cyan-300" />
          </div>
          <h1 className="text-3xl font-light tracking-tight">
            Soma Digital Admin
          </h1>
          <p className="mt-3 text-cyan-300/70 font-mono text-xs uppercase tracking-widest">
            {statusMessage}
          </p>
        </header>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-cyan-950/20">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isBusy}
            className="w-full h-14 rounded-xl bg-white text-black font-medium flex items-center justify-center gap-3 hover:bg-cyan-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "submitting" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-mono">
              <span className="bg-black/70 px-4 text-white/40">Or email</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isBusy}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/60 transition-all disabled:opacity-60"
                  placeholder="admin@soma.digital"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isBusy}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/60 transition-all disabled:opacity-60"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={isBusy}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
                <p className="text-sm font-medium text-red-200">
                  {status === "unauthorized" ? "Unauthorized" : error}
                </p>
                {status === "unauthorized" && (
                  <p className="mt-1 text-xs text-red-200/70">
                    This account has been signed out.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full h-14 rounded-xl bg-cyan-400 text-black font-semibold hover:bg-cyan-300 transition-colors flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Log In
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.section>
    </main>
  );
}

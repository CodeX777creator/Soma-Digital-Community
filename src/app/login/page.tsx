"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cpu, ArrowRight, Mail, Lock, Loader2, Eye, EyeOff, ChevronLeft } from "lucide-react";
import { signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider, sendPasswordResetEmail, getAdditionalUserInfo, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true); // Start loading to check redirect result
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { toast } = useToast();

  // Handle redirect result from Google Sign-In (fallback when popup is blocked)
  useEffect(() => {
    const checkRedirectResult = async () => {
      if (!auth) {
        setIsLoading(false);
        return;
      }
      try {
        console.log('[Google Login] Checking redirect result...');
        const result = await getRedirectResult(auth);
        console.log('[Google Login] Redirect result:', result);
        
        if (result?.user) {
          const info = getAdditionalUserInfo(result);
          console.log('[Google Login] Additional user info:', info);
          
          if (info?.isNewUser) {
            console.log('[Google Login] New user detected, redirecting to onboarding...');
            await signOut(auth);
            toast({
              title: "Let's set up your profile first",
              description: "New members complete onboarding before account activation.",
            });
            router.push("/open");
            return;
          }
          console.log('[Google Login] Existing user, redirecting to dashboard...');
          router.push("/dashboard");
        } else {
          // No redirect result, just stop loading
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error("[Google Login] Redirect result error:", err);
        setError(err.message || "Google sign-in failed after redirect.");
        setIsLoading(false);
      }
    };
    checkRedirectResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError("Authentication not initialized.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) {
      setError("Authentication not initialized.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      // Use redirect flow to avoid COOP/popup issues entirely
      await signInWithRedirect(auth, provider);
      // Page will redirect to Google and back - result handled in useEffect above
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setError(err.message || "Google sign-in failed.");
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError("Authentication not initialized.");
      return;
    }
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Reset link sent!",
        description: "Check your email to reset your password.",
      });
      setIsForgotPassword(false);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,183,255,0.05),transparent_50%)]" />
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute w-[800px] h-[800px] bg-cyan-500 rounded-full blur-[120px] top-[-30%] left-[-20%] opacity-20 animate-pulse" />
        <div className="absolute w-[600px] h-[600px] bg-blue-500 rounded-full blur-[120px] bottom-[-20%] right-[-10%] opacity-20 animate-pulse animation-delay-2000" />
        <div className="absolute w-[400px] h-[400px] bg-purple-500 rounded-full blur-[120px] top-[10%] right-[10%] opacity-10 animate-pulse animation-delay-4000" />
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-8 left-8 flex items-center gap-2 text-white/40 hover:text-white transition-colors group z-20"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back to Home</span>
      </button>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-6 border border-cyan-500/20"
          >
            <Cpu className="w-8 h-8 text-cyan-400" />
          </motion.div>
          <h1 className="text-3xl font-light tracking-tight text-white mb-2">
            {isForgotPassword ? "Reset Password" : "Welcome Back"}
          </h1>
          <p className="text-cyan-400/60 font-mono text-sm uppercase tracking-widest">
            {isForgotPassword ? "We'll send you a recovery link" : "Sign in to your member account"}
          </p>
        </div>

        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 backdrop-blur-xl">
          {isForgotPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                    placeholder="enter@your-email.com"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-cyan-500 text-black py-4 rounded-xl font-medium hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className="w-full text-white/40 hover:text-white text-sm py-2 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 rounded-xl font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-mono">
                  <span className="bg-black/50 backdrop-blur-xl px-4 text-white/40">Or email</span>
                </div>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                      placeholder="enter@your-email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-white/50 uppercase tracking-wider mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center">{error}</p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs text-cyan-400/60 hover:text-cyan-400 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-cyan-500 text-black py-4 rounded-xl font-medium mt-6 hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Log In
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/open')}
            className="text-white/40 hover:text-white text-sm transition-colors"
          >
            Don't have an account? Start your journey.
          </button>
        </div>
      </motion.div>
    </div>
  );
}

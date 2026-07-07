import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, UserPlus, Loader2, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, ChevronLeft, Mail } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { Badge } from "@/components/ui/badge";
import { createUserWithEmailAndPassword, updateProfile, signInWithRedirect, signInWithPopup, GoogleAuthProvider, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { GOOGLE_REDIRECT_PENDING_KEY, GOOGLE_REDIRECT_STORAGE_KEY, getSafeRedirectPath, isStandaloneApp } from "@/lib/auth";
import { dbService } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { validatePassword, cn } from "@/lib/utils";
import { awardXP } from "@/lib/xp";

export function AccountCreationStep() {
  const { roadmap, nextStep, prevStep, identities, goal, skillLevel, plan, budget, availableTime } = useOnboardingStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const handlePostSignup = () => {
    toast({
      title: "Account Created!",
      description: "Your digital wealth strategy is now secured.",
    });

    const safeRedirect = getSafeRedirectPath(redirectUrl);

    if (safeRedirect) {
      router.push(safeRedirect);
    } else if (plan === "pro" || plan === "elite") {
      router.push(`/dashboard?upgrade=${plan}`);
    } else {
      // If we are at the end of onboarding or on a standalone signup page, go to dashboard
      router.push("/dashboard");
    }
  };

  const saveUserData = async (user: any, nameToSave: string, emailVerified = user.emailVerified === true) => {
    const userData: any = {
      name: nameToSave || "Explorer",
      email: user.email || email,
      emailVerified,
      onboardingComplete: emailVerified,
    };

    if (identities) userData.identities = identities;
    if (goal) userData.goal = goal;
    if (skillLevel) userData.skillLevel = skillLevel;
    if (plan) userData.intendedPlan = plan;
    if (budget) userData.budget = budget;
    if (availableTime) userData.availableTime = availableTime;

    await dbService.saveUserProfile(user.uid, userData);

    if (emailVerified) {
      await awardXP(user.uid, 25, 'profile', { onboardingComplete: true, goal: goal || null, skillLevel: skillLevel || null });
      await createNotification(
        user.uid,
        'welcome',
        'Welcome to Soma Digital',
        'Your account is ready. Start your first mission from the dashboard.',
        '/dashboard'
      );
    }

    if (roadmap) {
      await dbService.saveRoadmap(user.uid, roadmap);
    }
  };

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword || !name) {
      toast({
        title: "Missing fields",
        description: "Please fill in all details to secure your strategy.",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords mismatch",
        description: "Please make sure both passwords match.",
        variant: "destructive"
      });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      toast({
        title: "Weak Password",
        description: passwordError,
        variant: "destructive"
      });
      return;
    }

    if (!auth) {
      toast({
        title: "Error",
        description: "Authentication not initialized.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const trimmedEmail = email.trim();
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });
      await saveUserData(user, name, false);
      
      // Send verification email
      await sendEmailVerification(user);
      setVerificationSent(true);
      
      toast({
        title: "Verification sent!",
        description: "Please check your inbox to verify your account.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create account.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    const currentAuth = auth;
    if (!currentAuth) {
      toast({
        title: "Error",
        description: "Authentication not initialized.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
        access_type: 'offline'
      });

      if (isStandaloneApp()) {
        const safeRedirect = getSafeRedirectPath(redirectUrl);
        sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, "true");

        if (safeRedirect) {
          sessionStorage.setItem(GOOGLE_REDIRECT_STORAGE_KEY, safeRedirect);
        }

        await signInWithRedirect(currentAuth, provider);
        return;
      }

      const result = await signInWithPopup(currentAuth, provider);
      const user = result.user;
      
      await saveUserData(user, user.displayName || "Explorer", true);
      handlePostSignup();
    } catch (error: any) {
      console.error("Google sign-up error:", error);
      toast({
        title: "Error",
        description: error.message || "Google sign-in failed.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationComplete = async () => {
    if (!auth) {
      window.location.reload();
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      window.location.reload();
      return;
    }

    setIsLoading(true);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        await dbService.saveUserProfile(user.uid, {
          emailVerified: true,
          onboardingComplete: true,
        });
        
        try {
          await awardXP(user.uid, 25, 'profile', { onboardingComplete: true, goal: goal || null, skillLevel: skillLevel || null });
          await createNotification(
            user.uid,
            'welcome',
            'Welcome to Soma Digital',
            'Your account is ready. Start your first mission from the dashboard.',
            '/dashboard'
          );
        } catch (setupError) {
          console.error("Non-critical signup setup failed:", setupError);
        }
        
        handlePostSignup();
      } else {
        toast({
          title: "Still waiting",
          description: "Please click the verification link in your email first.",
          variant: "destructive"
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-12">
        <GlassCard className="p-12 text-center space-y-6 border-primary/20">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Mail className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white font-headline">Verify Your Email</h2>
          <p className="text-white/60 text-lg leading-relaxed max-w-md mx-auto">
            We've sent a secure verification link to <span className="text-primary font-medium">{email}</span>. 
            Please click the link to activate your access.
          </p>
          <div className="pt-8 flex flex-col gap-4">
            <Button 
              onClick={handleVerificationComplete}
              disabled={isLoading}
              className="h-14 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold text-lg"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "I've Verified My Email"}
            </Button>
            <button 
              type="button"
              onClick={() => {
                if (!auth) return;
                const user = auth.currentUser;
                if (user) {
                  sendEmailVerification(user)
                    .then(() => toast({title: "Link Resent", description: "Verification email has been sent again.",}))
                    .catch((error) => toast({title: "Failed to resend", description: error.message || "Failed to resend verification email.", variant: "destructive"}));
                }
              }}
              className="text-white/40 hover:text-white transition-colors text-sm font-medium"
            >
              Didn't receive it? Resend Link
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in zoom-in duration-1000 relative">
      {/* Back Button */}
      <button 
        onClick={prevStep}
        className="absolute left-2 top-2 sm:left-4 sm:top-4 flex items-center gap-2 text-white/60 hover:text-white transition-colors group z-20"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>
      <div className="text-center space-y-3 mb-8">
        <h2 className="text-4xl md:text-5xl font-bold font-headline tracking-tighter text-white">Secure Your Strategy</h2>
        <p className="text-muted-foreground text-xl">Your {roadmap?.roadmapTitle || "Custom Growth Plan"} is ready to be deployed.</p>
      </div>

      <GlassCard className="p-8 border-primary/30 bg-primary/5 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4">
           <Badge className="bg-primary/20 text-primary border-none text-[10px] uppercase font-bold px-3 py-1">Priority Access</Badge>
        </div>
        
        <div className="space-y-6">
          <button
            onClick={handleGoogleSignup}
            disabled={isLoading}
            className="w-full relative z-20 flex items-center justify-center gap-3 bg-white text-black py-4 rounded-xl font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-mono">
              <span className="bg-primary/5 px-4 text-white/40">Or register with email</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary/70 ml-1">Full Name</label>
              <input 
                type="text" 
                placeholder="Enter your name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-14 rounded-xl bg-white/5 border border-white/10 px-6 focus:border-primary focus:bg-primary/5 outline-none transition-all text-white placeholder:text-white/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary/70 ml-1">Work Email</label>
              <input 
                type="email" 
                placeholder="you@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-14 rounded-xl bg-white/5 border border-white/10 px-6 focus:border-primary focus:bg-primary/5 outline-none transition-all text-white placeholder:text-white/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary/70 ml-1">Create Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-14 rounded-xl bg-white/5 border border-white/10 px-6 pr-12 focus:border-primary focus:bg-primary/5 outline-none transition-all text-white placeholder:text-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
                {[
                  { label: "Min 8 chars", met: password.length >= 8 },
                  { label: "Alphas/Nums/Symbols", met: /[a-zA-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password) },
                  { label: "No sequences", met: password.length > 0 && !validatePassword(password)?.includes("consecutive") && !validatePassword(password)?.includes("repeating") }
                ].map((rule, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                    rule.met ? "text-green-500" : "text-white/20"
                  )}>
                    {rule.met ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {rule.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary/70 ml-1">Confirm Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-14 rounded-xl bg-white/5 border border-white/10 px-6 pr-12 focus:border-primary focus:bg-primary/5 outline-none transition-all text-white placeholder:text-white/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={handleSignup}
            disabled={isLoading || !email || !password || !name}
            className="w-full relative z-20 h-16 rounded-xl bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group transition-all active:scale-95 disabled:opacity-50 mt-4"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                Deploy My Strategy
                <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground/60 pt-4">
            By creating an account, you agree to the Soma Digital <span className="text-primary hover:underline cursor-pointer">Terms of Service</span> and <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>
      </GlassCard>

      <div className="flex items-center justify-center gap-8 opacity-40">
         <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-white">100%</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">Encrypted</span>
         </div>
         <div className="w-px h-10 bg-white/10" />
         <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-white">AI</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">Powered</span>
         </div>
         <div className="w-px h-10 bg-white/10" />
         <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold text-white">24/7</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">Mentorship</span>
         </div>
      </div>
    </div>
  );
}

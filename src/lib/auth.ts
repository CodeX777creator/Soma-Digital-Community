import { User } from "firebase/auth";

export function requiresEmailVerification(user: User | null | undefined) {
  if (!user) return false;

  return user.providerData.some((provider) => provider.providerId === "password") && !user.emailVerified;
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

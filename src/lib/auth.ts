import { User } from "firebase/auth";

export const GOOGLE_REDIRECT_STORAGE_KEY = "soma-google-auth-redirect";

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

export function getSafeRedirectPath(redirect: string | null | undefined) {
  if (!redirect) return null;

  try {
    const decodedRedirect = decodeURIComponent(redirect);

    if (!decodedRedirect.startsWith("/") || decodedRedirect.startsWith("//")) {
      return null;
    }

    return decodedRedirect;
  } catch {
    return null;
  }
}

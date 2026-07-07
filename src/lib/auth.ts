import { User } from "firebase/auth";

export function requiresEmailVerification(user: User | null | undefined) {
  if (!user) return false;

  return user.providerData.some((provider) => provider.providerId === "password") && !user.emailVerified;
}

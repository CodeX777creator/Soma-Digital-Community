import { auth } from "@/lib/firebase";

export type AuthBootstrapInput = {
  displayName?: string | null;
  onboardingComplete?: boolean;
  onboarding?: {
    identities?: string[];
    goal?: string | null;
    skillLevel?: string | null;
    intendedPlan?: "explorer" | "pro" | "elite" | null;
    budget?: string | null;
    availableTime?: string | null;
  };
};

export async function bootstrapAuthenticatedUser(input: AuthBootstrapInput = {}) {
  if (!auth) {
    throw new Error("Authentication not initialized");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("User not authenticated");
  }

  const token = await currentUser.getIdToken(true);
  const response = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to initialize account");
  }

  return response.json() as Promise<{ profile: Record<string, any> }>;
}

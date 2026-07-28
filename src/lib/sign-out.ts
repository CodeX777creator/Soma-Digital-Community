import { Auth, signOut } from "firebase/auth";
import { removeFCMTokenFromFirestore } from "@/lib/fcm";
import { logger } from "@/lib/logger";

export async function signOutWithCleanup(authInstance: Auth) {
  try {
    await removeFCMTokenFromFirestore();
  } catch (error) {
    logger.warn("Unable to remove the push subscription before sign out", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await signOut(authInstance);
}

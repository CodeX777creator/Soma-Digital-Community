"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, onSnapshot, FirestoreError } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { requiresEmailVerification } from "@/lib/auth";
import { dbService, UserProfile } from "@/lib/db";
import { useUserStore } from "@/store/useUserStore";
import { logger, logFirestoreError } from "@/lib/logger";
import { bootstrapAuthenticatedUser } from "@/lib/auth-bootstrap";
import { awardXPAction } from "@/lib/xp";

interface AuthContextType {
  user: User | null;
  userData: UserProfile | null;
  loading: boolean;
  error: Error | null;
  refreshProfile: () => Promise<void>;
  isRetrying: boolean;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  userData: null, 
  loading: true,
  error: null,
  refreshProfile: async () => {},
  isRetrying: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const { syncProfile, clearState } = useUserStore();
  
  // Refs for cleanup and race condition prevention
  const firestoreUnsubscribeRef = useRef<(() => void) | null>(null);
  const isMounted = useRef(true);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const authUnsubscribeRef = useRef<(() => void) | null>(null);

  const handleError = useCallback((err: unknown, context: string) => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isMounted.current) {
      setError(error);
    }
    logger.error(`AuthProvider: ${context}`, error);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    
    // Prevent concurrent refreshes
    if (isRetrying) return;
    
    try {
      setIsRetrying(true);
      const profile = await dbService.getUserProfile(user.uid);
      if (isMounted.current) {
        setUserData(profile);
        if (profile) syncProfile(profile);
        setError(null);
        retryCount.current = 0;
      }
    } catch (error) {
      handleError(error, "Failed to refresh user profile");
    } finally {
      if (isMounted.current) {
        setIsRetrying(false);
      }
    }
  }, [user, syncProfile, handleError]);

  // Set up real-time Firestore listener for user profile
  useEffect(() => {
    if (!user?.uid || !db) return;

    // Clean up previous listener before setting up new one
    if (firestoreUnsubscribeRef.current) {
      firestoreUnsubscribeRef.current();
      firestoreUnsubscribeRef.current = null;
    }

    const userRef = doc(db, 'users', user.uid);
    
    const handleSnapshotError = (err: FirestoreError) => {
      logFirestoreError("User profile listener", err, `users/${user.uid}`);
      
      // Implement exponential backoff retry
      if (retryCount.current < maxRetries && isMounted.current) {
        retryCount.current++;
        const delay = Math.min(Math.pow(2, retryCount.current) * 1000, 30000);
        logger.warn(`Retrying profile listener in ${delay}ms (attempt ${retryCount.current}/${maxRetries})`);
        
        setTimeout(() => {
          if (isMounted.current) {
            refreshProfile();
          }
        }, delay);
      } else if (isMounted.current) {
        handleError(err, "Profile listener max retries exceeded");
      }
    };

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!isMounted.current) return;
        
        if (snapshot.exists()) {
          const profile = snapshot.data() as UserProfile;
          setUserData(profile);
          syncProfile(profile);
          setError(null);
          retryCount.current = 0;
        }
      },
      handleSnapshotError
    );

    firestoreUnsubscribeRef.current = unsubscribe;
    
    return () => {
      unsubscribe();
      firestoreUnsubscribeRef.current = null;
    };
  }, [user?.uid, syncProfile, refreshProfile, handleError]);

  // Main auth state listener
  useEffect(() => {
    if (!auth) {
      if (isMounted.current) {
        setLoading(false);
      }
      return;
    }
    const authInstance = auth;

    // Clean up any existing listener
    if (authUnsubscribeRef.current) {
      authUnsubscribeRef.current();
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted.current) return;

      if (requiresEmailVerification(firebaseUser)) {
        if (authInstance.currentUser) {
          await signOut(authInstance);
        }
        setUser(null);
        setUserData(null);
        clearState();
        setLoading(false);
        return;
      }
      
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const { profile } = await bootstrapAuthenticatedUser({
            displayName: firebaseUser.displayName,
          });
          await awardXPAction("daily_login").catch((xpError) => {
            logger.error("Failed to award login XP", xpError instanceof Error ? xpError : undefined);
          });

          if (isMounted.current) {
            setUserData(profile as UserProfile);
            syncProfile(profile);
          }
        } catch (error) {
          handleError(error, "Failed to fetch user profile");
        }
      } else {
        if (isMounted.current) {
          setUserData(null);
          clearState();
        }
      }
      
      if (isMounted.current) {
        setLoading(false);
      }
    }, (authError) => {
      logger.error("Auth state change error", authError);
      if (isMounted.current) {
        setLoading(false);
        setError(authError);
      }
    });

    authUnsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      authUnsubscribeRef.current = null;
    };
  }, [syncProfile, clearState, handleError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (firestoreUnsubscribeRef.current) {
        firestoreUnsubscribeRef.current();
      }
      if (authUnsubscribeRef.current) {
        authUnsubscribeRef.current();
      }
    };
  }, []);

  const contextValue = React.useMemo(() => ({
    user,
    userData,
    loading,
    error,
    refreshProfile,
    isRetrying,
  }), [user, userData, loading, error, refreshProfile, isRetrying]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

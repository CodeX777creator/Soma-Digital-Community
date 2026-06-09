"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { dbService, UserProfile } from "@/lib/db";
import { useUserStore } from "@/store/useUserStore";
import { awardXP } from "@/lib/xp";

interface AuthContextType {
  user: User | null;
  userData: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { syncProfile, clearState } = useUserStore();

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const profile = await dbService.getUserProfile(user.uid);
      setUserData(profile);
      if (profile) syncProfile(profile);
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const profile = await dbService.getUserProfile(firebaseUser.uid);

          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);

          const isSameDay = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();

          let updatedProfile = profile;
          let shouldRewardLogin = false;
          let newStreak = 1;

          if (profile) {
            const rawLastLogin = profile.lastLogin;
            const lastLogin = rawLastLogin?.toDate ? rawLastLogin.toDate() : rawLastLogin ? new Date(rawLastLogin) : null;

            if (!lastLogin || !isSameDay(lastLogin, today)) {
              shouldRewardLogin = true;
              newStreak = lastLogin && isSameDay(lastLogin, yesterday)
                ? (typeof profile.streak === 'number' ? profile.streak + 1 : 1)
                : 1;
            }
          } else {
            shouldRewardLogin = true;
            newStreak = 1;
          }

          if (shouldRewardLogin) {
            await dbService.saveUserProfile(firebaseUser.uid, {
              lastLogin: serverTimestamp(),
              streak: newStreak,
            });
            await awardXP(firebaseUser.uid, 5, 'login', { streak: newStreak });
            updatedProfile = {
              ...(profile ?? {}),
              streak: newStreak,
              lastLogin: today,
            } as UserProfile;
          }

          setUserData(updatedProfile);
          if (updatedProfile) syncProfile(updatedProfile);
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
        }
      } else {
        setUserData(null);
        clearState();
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [syncProfile, clearState]);

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

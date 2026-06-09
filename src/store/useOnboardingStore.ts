import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PlanType = 'explorer' | 'pro' | 'elite' | null;

interface OnboardingState {
  currentStep: number;
  plan: PlanType;
  identities: string[];
  goal: string | null;
  skillLevel: string | null;
  interests: string[];
  budget: string | null;
  availableTime: string | null;
  roadmap: any | null;
  
  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setPlan: (plan: PlanType) => void;
  toggleIdentity: (identity: string) => void;
  setIdentities: (identities: string[]) => void;
  setGoal: (goal: string) => void;
  setSkillLevel: (skill: string) => void;
  setBudget: (budget: string) => void;
  setAvailableTime: (time: string) => void;
  toggleInterest: (interest: string) => void;
  setRoadmap: (roadmap: any) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      currentStep: 1,
      plan: null,
      identities: [],
      goal: null,
      skillLevel: null,
      interests: [],
      budget: null,
      availableTime: null,
      roadmap: null,

      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      prevStep: () => set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) })),
      setPlan: (plan) => set({ plan }),
      toggleIdentity: (id) => set((state) => ({
        identities: state.identities.includes(id)
          ? state.identities.filter(i => i !== id)
          : [...state.identities, id]
      })),
      setIdentities: (identities) => set({ identities }),
      setGoal: (goal) => set({ goal }),
      setSkillLevel: (skillLevel) => set({ skillLevel }),
      setBudget: (budget) => set({ budget }),
      setAvailableTime: (availableTime) => set({ availableTime }),
      toggleInterest: (interest) => set((state) => ({
        interests: state.interests.includes(interest)
          ? state.interests.filter(i => i !== interest)
          : [...state.interests, interest]
      })),
      setRoadmap: (roadmap) => set({ roadmap }),
      reset: () => set({
        currentStep: 1,
        plan: null,
        identities: [],
        goal: null,
        skillLevel: null,
        interests: [],
        budget: null,
        availableTime: null,
        roadmap: null
      }),
    }),
    {
      name: 'soma-onboarding-storage',
    }
  )
);

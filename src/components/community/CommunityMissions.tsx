"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  Circle, 
  MessageCircle, 
  Hand, 
  Heart, 
  Award,
  Sparkles,
  ChevronRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { dbService } from "@/lib/db";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface CommunityMission {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  xpReward: number;
  checkCompleted: (userData: any) => boolean;
}

export const DEFAULT_MISSIONS: CommunityMission[] = [
  {
    id: "introduce-yourself",
    title: "Say Hello",
    description: "Introduce yourself to the community by creating your first post",
    icon: <Hand className="w-5 h-5" />,
    xpReward: 25,
    checkCompleted: (userData) => userData?.missions?.introduceYourself === true || userData?.postCount > 0,
  },
  {
    id: "engage-post",
    title: "Make Connections",
    description: "Like or comment on someone else's post",
    icon: <Heart className="w-5 h-5" />,
    xpReward: 15,
    checkCompleted: (userData) => userData?.missions?.engagePost === true || userData?.engagementScore > 0,
  },
  {
    id: "start-discussion",
    title: "Start a Discussion",
    description: "Create a post with a question or insight to spark conversation",
    icon: <MessageCircle className="w-5 h-5" />,
    xpReward: 20,
    checkCompleted: (userData) => userData?.missions?.startDiscussion === true || userData?.postCount > 0,
  },
  {
    id: "complete-profile",
    title: "Complete Your Profile",
    description: "Add your identity, goals, and profile information",
    icon: <Award className="w-5 h-5" />,
    xpReward: 30,
    checkCompleted: (userData) => 
      userData?.missions?.completeProfile === true || 
      (userData?.selectedIdentity && userData?.goal && userData?.onboardingComplete),
  },
];

interface CommunityMissionsProps {
  onClose?: () => void;
}

export function CommunityMissions({ onClose }: CommunityMissionsProps) {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const [missions, setMissions] = useState<CommunityMission[]>(DEFAULT_MISSIONS);
  const [completedMissions, setCompletedMissions] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Subscribe to user's mission progress
  useEffect(() => {
    if (!user?.uid || !db) return;
    
    const userRef = doc(db, "users", user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const completed = new Set<string>();
        
        missions.forEach(mission => {
          if (mission.checkCompleted(data)) {
            completed.add(mission.id);
          }
        });
        
        setCompletedMissions(completed);
      }
    });
    
    return unsub;
  }, [user?.uid, missions]);

  const completedCount = completedMissions.size;
  const totalCount = missions.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const handleMissionClick = (mission: CommunityMission) => {
    if (completedMissions.has(mission.id)) return;
    
    // Navigate or show guidance based on mission
    switch (mission.id) {
      case "introduce-yourself":
      case "start-discussion":
        toast({
          title: "Create a Post",
          description: "Click 'Share a win, insight, or ask...' to create your first post!",
        });
        break;
      case "engage-post":
        toast({
          title: "Engage with the Community",
          description: "Find a post you like and click the heart or leave a comment!",
        });
        break;
      case "complete-profile":
        toast({
          title: "Complete Your Profile",
          description: "Visit your profile settings to add more information about yourself.",
        });
        break;
    }
  };

  const visibleMissions = showAll ? missions : missions.slice(0, 2);

  if (!user) return null;

  return (
    <GlassCard className="p-4 border-l-4 border-l-primary rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Community Missions</h3>
            <p className="text-[10px] text-muted-foreground">
              Complete to earn XP and unlock features
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-lg font-bold text-primary">{completedCount}/{totalCount}</span>
            <p className="text-[9px] text-muted-foreground">completed</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Missions list */}
      <div className="space-y-2">
        {visibleMissions.map((mission) => {
          const isCompleted = completedMissions.has(mission.id);
          
          return (
            <motion.button
              key={mission.id}
              onClick={() => handleMissionClick(mission)}
              disabled={isCompleted}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                isCompleted 
                  ? "bg-white/[0.02] opacity-60" 
                  : "bg-white/[0.04] hover:bg-white/[0.06] cursor-pointer"
              )}
              whileHover={!isCompleted ? { scale: 1.01 } : {}}
              whileTap={!isCompleted ? { scale: 0.99 } : {}}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                isCompleted ? "bg-green-500/20 text-green-400" : "bg-primary/20 text-primary"
              )}>
                {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : mission.icon}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    "text-xs font-medium truncate",
                    isCompleted && "line-through text-muted-foreground"
                  )}>
                    {mission.title}
                  </p>
                  <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    +{mission.xpReward} XP
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {mission.description}
                </p>
              </div>
              
              {!isCompleted && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </motion.button>
          );
        })}
      </div>

      {/* Show more/less */}
      {missions.length > 2 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 text-[10px] text-primary hover:underline"
        >
          {showAll ? "Show less" : `Show ${missions.length - 2} more missions`}
        </button>
      )}

      {/* All completed message */}
      {completedCount === totalCount && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center"
        >
          <p className="text-xs font-bold text-green-400">🎉 All missions completed!</p>
          <p className="text-[10px] text-muted-foreground">
            You&apos;re officially part of the community!
          </p>
        </motion.div>
      )}
    </GlassCard>
  );
}

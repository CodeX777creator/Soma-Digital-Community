import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type MissionTemplate = {
  title: string;
  description: string;
  xpReward: number;
};

const TEMPLATES: MissionTemplate[] = [
  { title: 'Post in community', description: 'Share an update or question in the community.', xpReward: 30 },
  { title: 'Chat with AI mentor', description: 'Ask the AI mentor for personalized advice.', xpReward: 40 },
  { title: 'Visit marketplace', description: 'Browse the marketplace for useful resources.', xpReward: 20 },
  { title: 'Complete profile', description: 'Finish your profile to get better recommendations.', xpReward: 25 },
];

export async function seedMissionsIfMissing(uid: string) {
  if (!uid) return;

  const today = new Date().toISOString().slice(0, 10);
  const missionsRef = collection(db, `users/${uid}/missions`);
  const q = query(missionsRef, where('dateString', '==', today));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) return; // already have missions for today

  // pick three contextual missions (rotate templates)
  const chosen = [TEMPLATES[0], TEMPLATES[1], TEMPLATES[2]];

  const now = Timestamp.now();
  const expires = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

  for (const t of chosen) {
    await addDoc(collection(db, `users/${uid}/missions`), {
      title: t.title,
      description: t.description,
      xp: t.xpReward,
      xpReward: t.xpReward,
      completed: false,
      createdAt: now,
      expiresAt: expires,
      dateString: today,
    });
  }
}

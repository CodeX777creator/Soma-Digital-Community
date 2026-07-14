import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { DASHBOARD_MISSION_TEMPLATES, getDashboardMissionDateString } from '@/lib/dashboard-missions';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const entitlements = await requireUserEntitlements(req);
    const today = getDashboardMissionDateString();
    const missionsRef = adminDb.collection('users').doc(entitlements.uid).collection('missions');
    const existing = await missionsRef.where('dateString', '==', today).limit(1).get();

    if (!existing.empty) {
      return NextResponse.json({ seeded: false });
    }

    const batch = adminDb.batch();
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

    DASHBOARD_MISSION_TEMPLATES.forEach((template, index) => {
      const ref = missionsRef.doc(`${today}-${index + 1}`);
      batch.set(ref, {
        title: template.title,
        description: template.description,
        xp: template.xpReward,
        xpReward: template.xpReward,
        completed: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt,
        dateString: today,
      });
    });

    await batch.commit();
    return NextResponse.json({ seeded: true, count: DASHBOARD_MISSION_TEMPLATES.length });
  } catch (error) {
    logger.error('[API /dashboard/missions/seed] Failed to seed missions', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Unable to prepare daily goals.' }, { status: 500 });
  }
}

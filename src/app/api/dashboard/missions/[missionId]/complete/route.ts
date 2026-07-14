import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ missionId: string }> }
) {
  try {
    const entitlements = await requireUserEntitlements(req);
    const { missionId } = await context.params;

    if (!missionId || missionId.length > 160) {
      return NextResponse.json({ error: 'Invalid mission.' }, { status: 400 });
    }

    const missionRef = adminDb
      .collection('users')
      .doc(entitlements.uid)
      .collection('missions')
      .doc(missionId);

    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(missionRef);
      if (!snap.exists) {
        return { status: 404 as const, xpAwarded: 0 };
      }

      const data = snap.data() || {};
      if (data.completed === true) {
        return { status: 200 as const, xpAwarded: 0, alreadyCompleted: true };
      }

      const xpAwarded = typeof data.xp === 'number'
        ? data.xp
        : typeof data.xpReward === 'number'
          ? data.xpReward
          : 0;

      tx.update(missionRef, {
        completed: true,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { status: 200 as const, xpAwarded, alreadyCompleted: false };
    });

    if (result.status === 404) {
      return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[API /dashboard/missions/[missionId]/complete] Failed to complete mission', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Unable to complete mission.' }, { status: 500 });
  }
}

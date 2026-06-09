import { NextResponse } from 'next/server';
import { requireUserEntitlements } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    const { subscription, isAdmin, roles, profile, uid } = await requireUserEntitlements(req as any);
    return NextResponse.json({
      uid,
      isAdmin,
      roles,
      subscription,
      profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unauthorized' },
      { status: error.status || 401 }
    );
  }
}

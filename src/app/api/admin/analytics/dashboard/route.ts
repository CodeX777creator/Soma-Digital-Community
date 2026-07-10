import { NextResponse } from 'next/server';
import { getAdminAnalyticsDashboard } from '@/modules/analytics';

export async function GET(req: Request) {
  try {
    const dashboard = await getAdminAnalyticsDashboard(req);
    return NextResponse.json(dashboard);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unauthorized' },
      { status: error?.status || 401 }
    );
  }
}


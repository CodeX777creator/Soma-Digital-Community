import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

type VerifySetupCodeRequest = {
  code?: unknown;
};

async function compareSetupCode(code: string, storedCode: unknown) {
  if (typeof storedCode === 'string' && storedCode.length > 0) {
    return code === storedCode;
  }

  const envCode = process.env.ADMIN_SETUP_CODE;
  return typeof envCode === 'string' && envCode.length > 0 && code === envCode;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VerifySetupCodeRequest;
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!code) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const configSnap = await adminDb.collection('system').doc('config').get();
    const config = configSnap.exists ? configSnap.data() : null;

    if (config?.adminSetupComplete === true) {
      return NextResponse.json({ valid: false });
    }

    const valid = await compareSetupCode(code, config?.setupCodeHash);

    return NextResponse.json({ valid });
  } catch (error) {
    console.error('Failed to verify admin setup code:', error);

    return NextResponse.json(
      { valid: false, error: 'Unable to verify setup code' },
      { status: 500 }
    );
  }
}

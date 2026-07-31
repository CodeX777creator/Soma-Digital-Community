import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: Record<string, unknown>) => void;
};

function getBearerToken(authorization?: string): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function isAdminClaims(claims: Record<string, unknown>): boolean {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  return claims.admin === true || claims.isAdmin === true || claims.role === 'admin' || roles.includes('admin');
}

export async function requireAdminHttpRequest(
  req: { method?: string; headers: Record<string, string | string[] | undefined> },
  res: HttpResponse,
): Promise<boolean> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }

  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const token = getBearerToken(authorization);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    if (isAdminClaims(decoded as unknown as Record<string, unknown>)) {
      return true;
    }

    const profile = await getFirestore().collection('users').doc(decoded.uid).get();
    const data = profile.data() || {};
    const roles = Array.isArray(data.roles) ? data.roles : [];
    if (data.isAdmin === true || data.role === 'admin' || roles.includes('admin')) {
      return true;
    }

    res.status(403).json({ error: 'Administrator access required' });
    return false;
  } catch {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
}

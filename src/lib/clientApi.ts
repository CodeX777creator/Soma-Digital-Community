import { auth } from '@/lib/firebase';

export async function authFetch(input: RequestInfo, init?: RequestInit) {
  if (!auth) {
    throw new Error('Authentication not initialized');
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }

  const buildHeaders = async (forceRefresh = true) => {
    const token = await currentUser.getIdToken(forceRefresh);
    const headers = new Headers(init?.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  const doFetch = async (headers: Headers) =>
    fetch(input, {
      ...init,
      headers,
      credentials: 'same-origin',
    });

  const headers = await buildHeaders(true);
  const response = await doFetch(headers);

  if (response.status === 401) {
    const refreshedHeaders = await buildHeaders(true);
    return doFetch(refreshedHeaders);
  }

  return response;
}

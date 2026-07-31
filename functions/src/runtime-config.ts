type RuntimeSecret = {
  value: () => string;
};

type CachedSecret = {
  value: string;
  expiresAt: number;
};

// SecretParam.value() is already resolved from the Function environment, but
// this cache prevents repeated reads in long-running workers and keeps secret
// access behavior explicit. The short TTL allows rotations to propagate.
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000;
const secretCache = new Map<string, CachedSecret>();

export function readRuntimeSecret(name: string, secret: RuntimeSecret): string {
  const now = Date.now();
  const cached = secretCache.get(name);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = secret.value();
  secretCache.set(name, { value, expiresAt: now + SECRET_CACHE_TTL_MS });
  return value;
}

export function clearRuntimeSecretCache(): void {
  secretCache.clear();
}

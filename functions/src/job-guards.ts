export function shouldQueueRefreshJob(
  status: string | undefined,
  leaseExpiresAtMs: number | null | undefined,
  now = Date.now()
): boolean {
  if (!status || status === 'completed' || status === 'failed' || status === 'cancelled') return true;
  if (status === 'queued') return false;
  if (status === 'in_progress' || status === 'processing') {
    return leaseExpiresAtMs !== null && leaseExpiresAtMs !== undefined && leaseExpiresAtMs <= now;
  }
  return true;
}

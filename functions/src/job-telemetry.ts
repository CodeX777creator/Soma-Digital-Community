type JobSummary = Record<string, unknown> | undefined;

function compactSummary(summary: unknown): Record<string, unknown> | undefined {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return undefined;
  return Object.fromEntries(Object.entries(summary).filter(([, value]) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  ));
}

export async function runScheduledJob<T>(
  jobName: string,
  task: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await task();
    console.log('[ScheduledJob] completed', {
      jobName,
      durationMs: Date.now() - startedAt,
      summary: compactSummary(result),
    });
    return result;
  } catch (error) {
    console.error('[ScheduledJob] failed', {
      jobName,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

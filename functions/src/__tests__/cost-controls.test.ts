import { shouldQueueRefreshJob } from '../job-guards';

describe('scheduled worker cost controls', () => {
  it('queues a missing refresh job', () => {
    expect(shouldQueueRefreshJob(undefined, null, 1_000)).toBe(true);
  });

  it('does not rewrite an already queued refresh job', () => {
    expect(shouldQueueRefreshJob('queued', null, 1_000)).toBe(false);
  });

  it('does not reclaim a live refresh lease', () => {
    expect(shouldQueueRefreshJob('in_progress', 2_000, 1_000)).toBe(false);
  });

  it('reclaims an expired refresh lease', () => {
    expect(shouldQueueRefreshJob('in_progress', 900, 1_000)).toBe(true);
  });

  it('allows a completed job to be queued again for a future refresh', () => {
    expect(shouldQueueRefreshJob('completed', null, 1_000)).toBe(true);
  });
});

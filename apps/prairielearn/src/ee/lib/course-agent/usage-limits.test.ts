import { describe, expect, it } from 'vitest';

import { withConfig } from '../../../tests/utils/config.js';

import {
  CourseAgentUsageLimitError,
  type RollingUsageStore,
  assertCourseAgentWithinUsageLimits,
  recordCourseAgentRollingUsage,
} from './usage-limits.js';

class FakeStore implements RollingUsageStore {
  values = new Map<string, Map<string, number>>();

  async read(scope: string) {
    return [...(this.values.get(scope)?.values() ?? [])].reduce((total, value) => total + value, 0);
  }

  async update(scope: string, runId: string, value: number) {
    const runs = this.values.get(scope) ?? new Map<string, number>();
    runs.set(runId, value);
    this.values.set(scope, runs);
    return this.read(scope);
  }
}

describe('course-agent rolling usage limits', () => {
  it('updates a run cumulatively without double counting and enforces configured scopes', async () => {
    await withConfig(
      {
        courseAgentUsageLimits: {
          windowSeconds: 3600,
          perUserMilliDollars: 10,
          perCourseMilliDollars: 100,
          globalMilliDollars: 1000,
        },
      },
      async () => {
        const store = new FakeStore();
        const input = { userId: '1', courseId: '2', runId: 'run', store };
        await recordCourseAgentRollingUsage({ ...input, cumulativeMilliDollars: 10 });
        await recordCourseAgentRollingUsage({ ...input, cumulativeMilliDollars: 10 });
        await expect(assertCourseAgentWithinUsageLimits(input)).rejects.toBeInstanceOf(
          CourseAgentUsageLimitError,
        );
        expect(await store.read('user:1')).toBe(10);
      },
    );
  });
});

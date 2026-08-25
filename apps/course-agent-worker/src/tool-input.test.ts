import { describe, expect, it } from 'vitest';

import { runtimeEventInputForTool } from './tool-input.js';

describe('runtimeEventInputForTool', () => {
  it('includes structured course-data queries in runtime events', () => {
    const input = {
      resource: 'assessment_attempts',
      query: {
        where: [{ field: 'course_instance.id', operator: 'eq', value: '66' }],
        metrics: [{ function: 'count', as: 'attempt_count' }],
      },
    };

    expect(runtimeEventInputForTool('mcp__prairielearn_data__query_course_data', input)).toBe(
      input,
    );
  });

  it('does not persist general-purpose tool inputs', () => {
    expect(runtimeEventInputForTool('Bash', { command: 'printenv' })).toBeUndefined();
    expect(runtimeEventInputForTool('WebFetch', { url: 'https://example.com' })).toBeUndefined();
  });
});

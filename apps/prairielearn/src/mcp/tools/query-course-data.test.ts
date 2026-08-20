import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as helperServer from '../../tests/helperServer.js';

import { queryCourseData } from './query-course-data.js';

describe('queryCourseData', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);
  it('rejects writes before they reach Postgres', async () => {
    await expect(queryCourseData('UPDATE users SET name = name')).rejects.toThrow(
      'Only SELECT and WITH queries are allowed.',
    );
  });

  it('rejects multiple statements', async () => {
    await expect(queryCourseData('SELECT 1; SELECT 2')).rejects.toThrow(
      'Only a single statement is allowed.',
    );
  });

  it('bounds returned rows', async () => {
    const result = await queryCourseData('SELECT value FROM generate_series(1, 1001) AS value');
    expect(result.rows).toHaveLength(1000);
    expect(result.rowCount).toBe(1001);
    expect(result.truncated).toBe(true);
  });
});

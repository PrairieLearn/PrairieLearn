import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CourseSandbox } from '../sandbox/sandbox.js';

import { getCourseData, listCourseDatasets } from './course-data.js';

vi.mock('../monitoring.js', () => ({ logEvent: vi.fn() }));

// The committed copy of PrairieLearn's dataset list response.
const SCHEMA = readFileSync(
  path.resolve(import.meta.dirname, '../../../../docs/assets/course-data-api-v1.schema.json'),
  'utf8',
);

const context = {
  plUrl: 'http://pl.test',
  serviceToken: 'token',
  conversationId: 'conversation',
  courseId: '12',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('course data tools', () => {
  it('lists every column of PrairieLearn’s datasets with its type and meaning', async () => {
    const fetch = vi.fn(async () => new Response(SCHEMA));
    vi.stubGlobal('fetch', fetch);

    const reply = await listCourseDatasets(context);

    expect(fetch).toHaveBeenCalledWith(
      new URL('http://pl.test/pl/api/v1/course/12/data'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token', 'X-Course-Agent-Conversation': 'conversation' },
      }),
    );
    expect(reply.success).toBe(true);
    const lines = reply.text.split('\n');
    expect(lines).toContain(
      'submissions: Student answer submissions, without answer contents. Instructor previews are excluded.',
    );
    expect(lines).toContain('  id (string)');
    expect(lines).toContain(
      '  mode (one of Public, Exam, SEB, nullable): Server mode the answer was submitted in.',
    );
    expect(lines).toContain(
      '  graded_at (date-time, nullable): When the submission was graded. Null if not graded.',
    );
  });

  it('saves downloaded rows in the sandbox and tells the model how they were filtered', async () => {
    const fetch = vi.fn(
      async () => new Response('{"id":"1","score":0.25}\n{"id":"2","score":0}\n'),
    );
    vi.stubGlobal('fetch', fetch);
    const writeCourseData = vi.fn(async () => '/workspace/session/course-data/submissions-1.jsonl');

    const reply = await getCourseData({
      ...context,
      sandbox: { writeCourseData } as unknown as DurableObjectStub<CourseSandbox>,
      request: {
        dataset: 'submissions',
        filters: [
          { column: 'score', op: 'lt', value: 0.5 },
          { column: 'question_id', op: 'in', value: ['1', '2', '3', '4', '5', '6', '7'] },
        ],
        select: ['id', 'score'],
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL('http://pl.test/pl/api/v1/course/12/data/submissions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filters: [
            { column: 'score', op: 'lt', value: 0.5 },
            { column: 'question_id', op: 'in', value: ['1', '2', '3', '4', '5', '6', '7'] },
          ],
          select: ['id', 'score'],
        }),
      }),
    );
    expect(writeCourseData).toHaveBeenCalledWith(
      'submissions',
      '{"id":"1","score":0.25}\n{"id":"2","score":0}\n',
    );
    expect(reply).toEqual({
      success: true,
      text: 'Wrote 2 rows (0.0 MB) to /workspace/session/course-data/submissions-1.jsonl. Filters: score lt 0.5 AND question_id in ["1","2","3","4","5",…] (7 values). The file holds only matching rows. Columns: id, score.',
    });
  });
});

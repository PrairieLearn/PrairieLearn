import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CourseSandbox } from '../sandbox/sandbox.js';

import { getCourseData, listCourseDatasets } from './course-data.js';

vi.mock('../monitoring.js', () => ({ logEvent: vi.fn() }));

// Part of PrairieLearn's dataset list response, as Zod's JSON Schema renders it.
const SCHEMA = JSON.stringify({
  version: 1,
  datasets: {
    submissions: {
      description: 'Student answer submissions. Instructor previews are excluded.',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^\\d+$' },
          mode: {
            anyOf: [{ type: 'string', enum: ['Public', 'Exam', 'SEB'] }, { type: 'null' }],
            description: 'Server mode the answer was submitted in.',
          },
          graded_at: {
            anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
            description: 'When the submission was graded. Null if not graded.',
          },
        },
      },
    },
  },
});

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
      new URL('http://pl.test/pl/course/12/course_agent/data'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token', 'X-Course-Agent-Conversation': 'conversation' },
      }),
    );
    expect(reply.success).toBe(true);
    const lines = reply.text.split('\n');
    expect(lines).toContain(
      'submissions: Student answer submissions. Instructor previews are excluded.',
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
    const sandbox = fakeSandbox();

    const reply = await getCourseData({
      ...context,
      sandbox: sandbox.stub,
      request: {
        dataset: 'submissions',
        filters: [
          { column: 'score', op: 'lt', value: 0.5 },
          { column: 'question_id', op: 'in', value: ['1', '2', '3', '4', '5', '6', '7'] },
        ],
        select: ['id', 'score'],
        limit: 2,
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL('http://pl.test/pl/course/12/course_agent/data/submissions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filters: [
            { column: 'score', op: 'lt', value: 0.5 },
            { column: 'question_id', op: 'in', value: ['1', '2', '3', '4', '5', '6', '7'] },
          ],
          select: ['id', 'score'],
          limit: 2,
        }),
      }),
    );
    expect(sandbox.written()).toBe('{"id":"1","score":0.25}\n{"id":"2","score":0}\n');
    expect(reply).toEqual({
      success: true,
      text: 'Wrote 2 rows (0.0 MB) to /workspace/session/course-data/submissions-1.jsonl. Filters: score lt 0.5 AND question_id in ["1","2","3","4","5",…] (7 values). The file holds only matching rows. Limit: 2 rows, so more rows may match. Columns: id, score.',
    });
  });

  it('stops a large download at a row boundary and says the file is incomplete', async () => {
    // 1 MB rows, delivered in chunks that split them.
    const row = `{"id":"1","feedback":"${'x'.repeat(1024 * 1024 - 27)}"}\n`;
    const body = new TextEncoder().encode(row.repeat(30));
    const chunks = Array.from({ length: Math.ceil(body.length / 65_000) }, (_, i) =>
      body.subarray(i * 65_000, (i + 1) * 65_000),
    );
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === chunks.length) controller.close();
        else controller.enqueue(chunks[sent++]);
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream)),
    );
    const sandbox = fakeSandbox();

    const reply = await getCourseData({
      ...context,
      sandbox: sandbox.stub,
      request: { dataset: 'submissions', select: ['id', 'feedback'] },
    });

    expect(sandbox.written()).toBe(row.repeat(25));
    expect(sent).toBeLessThan(chunks.length);
    expect(reply).toEqual({
      success: true,
      text: 'Wrote 25 rows (25.0 MB) to /workspace/session/course-data/submissions-1.jsonl. No filters. Stopped at the 25 MB download limit, so the file holds only the first rows returned and more rows match. Columns: id, feedback.',
    });
  });
});

/** A sandbox stub that reads what `writeCourseData` is given, as the real one does. */
function fakeSandbox() {
  let text = '';
  const writeCourseData = vi.fn(async (_dataset: string, contents: ReadableStream<Uint8Array>) => {
    text = await new Response(contents).text();
    return '/workspace/session/course-data/submissions-1.jsonl';
  });
  return {
    stub: { writeCourseData } as unknown as DurableObjectStub<CourseSandbox>,
    written: () => text,
  };
}

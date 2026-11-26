import { CourseDataSchemaResponse, describeCourseDatasets } from '@prairielearn/course-agent-types';

import { logEvent } from '../monitoring.js';
import type { CourseDataRequest, ToolReply } from '../sandbox/codex.js';
import type { CourseSandbox } from '../sandbox/sandbox.js';

import { type PrairieLearnContext, authHeaders, errorMessage } from './prairielearn.js';

// Rows are streamed into the sandbox; this bounds one download's size on disk and its time.
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Passes JSONL through up to `maxBytes`, ending at a row boundary, and counts what it passed. At
 * the limit it stops reading, which cancels the download.
 */
function capRows(maxBytes: number) {
  const result = { rows: 0, bytes: 0, truncated: false };
  // The end of the last chunk, after its last newline: the start of a row still arriving.
  let partial = new Uint8Array(0);
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const data = new Uint8Array(partial.length + chunk.length);
      data.set(partial);
      data.set(chunk, partial.length);
      let end = data.lastIndexOf(NEWLINE) + 1;
      const budget = maxBytes - result.bytes;
      // Past the limit, keep only the rows that fit. A row still arriving that can't fit also
      // ends the file, so it is never buffered whole.
      if (data.length > budget) {
        end = data.subarray(0, budget).lastIndexOf(NEWLINE) + 1;
        result.truncated = true;
      }
      const rows = data.subarray(0, end);
      for (const byte of rows) if (byte === NEWLINE) result.rows++;
      result.bytes += rows.length;
      if (rows.length > 0) controller.enqueue(rows);
      partial = data.slice(end);
      if (result.truncated) controller.terminate();
    },
    flush(controller) {
      // PrairieLearn ends every row with a newline, so this is only a row cut off by an error.
      if (partial.length > 0) {
        controller.error(new Error('Course data ended in the middle of a row'));
      }
    },
  });
  return { stream, result };
}

const NEWLINE = 0x0a;

/** A filter as the model and logs see it; a long `in` list shows its first values and its size. */
function describeFilter(filter: NonNullable<CourseDataRequest['filters']>[number]) {
  if (filter.op !== 'in' || filter.value.length <= 5) {
    return `${filter.column} ${filter.op} ${JSON.stringify(filter.value)}`;
  }
  const shown = filter.value.slice(0, 5).map((value) => JSON.stringify(value));
  return `${filter.column} in [${shown.join(',')},…] (${filter.value.length} values)`;
}

// Longer than PrairieLearn's 60-second query timeout, so a slow query fails with its reason.
const REQUEST_TIMEOUT_MS = 120_000;

const UNAVAILABLE: ToolReply = {
  success: false,
  text: 'Course data is unavailable. Reload the PrairieLearn page.',
};

/** Serves `list_course_datasets` from `GET /pl/course/:course_id/course_agent/data`. */
export async function listCourseDatasets(context: PrairieLearnContext): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  const response = await fetch(
    new URL(`/pl/course/${context.courseId}/course_agent/data`, context.plUrl),
    { headers: authHeaders(context), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  return {
    success: true,
    text: describeCourseDatasets(CourseDataSchemaResponse.parse(await response.json())),
  };
}

/**
 * Serves `get_course_data` from `POST /pl/course/:course_id/course_agent/data/:dataset`: streams
 * the rows into a file in the sandbox and describes the file.
 */
export async function getCourseData({
  sandbox,
  request,
  ...context
}: PrairieLearnContext & {
  sandbox: DurableObjectStub<CourseSandbox>;
  request: CourseDataRequest;
}): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  const { dataset, ...query } = request;
  const started = Date.now();
  const response = await fetch(
    new URL(
      `/pl/course/${context.courseId}/course_agent/data/${encodeURIComponent(dataset)}`,
      context.plUrl,
    ),
    {
      method: 'POST',
      headers: { ...authHeaders(context), 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }

  const capped = capRows(MAX_BYTES);
  const path = await sandbox.writeCourseData(dataset, response.body!.pipeThrough(capped.stream));
  const { rows, bytes, truncated } = capped.result;
  logEvent('course_data_fetched', {
    conversationId: context.conversationId,
    dataset,
    // Values can identify students, so only the shape of each filter is logged.
    filters: (query.filters ?? []).map((filter) =>
      filter.op === 'in'
        ? `${filter.column} in (${filter.value.length} values)`
        : `${filter.column} ${filter.op}`,
    ),
    rows,
    bytes,
    truncated,
    elapsedMs: Date.now() - started,
  });
  const filters = (query.filters ?? []).map(describeFilter);
  return {
    success: true,
    text: [
      `Wrote ${rows} rows (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${path}.`,
      filters.length > 0
        ? `Filters: ${filters.join(' AND ')}. The file holds only matching rows.`
        : 'No filters.',
      query.limit !== undefined &&
        `Limit: ${query.limit} rows${rows === query.limit ? ', so more rows may match' : ''}.`,
      truncated &&
        `Stopped at the ${MAX_BYTES / 1024 / 1024} MB download limit, so the file holds only the first rows returned and more rows match.`,
      `Columns: ${query.select.join(', ')}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

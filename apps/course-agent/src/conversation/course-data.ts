import { z } from 'zod';

import { COURSE_DATA_MAX_IN_VALUES } from '@prairielearn/course-agent-types';

import { logEvent } from '../monitoring.js';
import type { CourseDataRequest, ToolReply } from '../sandbox/codex.js';
import type { CourseSandbox } from '../sandbox/sandbox.js';

// The whole response is held in memory and sent to the sandbox in one RPC.
const MAX_BYTES = 25 * 1024 * 1024;

const JsonSchemaProperty = z.looseObject({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  format: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  description: z.string().optional(),
});
const ColumnSchema = JsonSchemaProperty.extend({
  anyOf: z.array(JsonSchemaProperty).optional(),
});
const SchemaResponse = z.object({
  version: z.number(),
  datasets: z.record(
    z.string(),
    z.object({
      description: z.string(),
      schema: z.object({ properties: z.record(z.string(), ColumnSchema) }),
    }),
  ),
});

/** One line per column, such as `graded_at (date-time, nullable): Null if not graded.` */
function describeColumn(name: string, property: z.infer<typeof ColumnSchema>) {
  const variants = property.anyOf ?? [property];
  const types = variants.flatMap((variant) =>
    Array.isArray(variant.type) ? variant.type : variant.type ? [variant.type] : [],
  );
  const nullable = types.includes('null');
  const values = variants.flatMap((variant) => variant.enum ?? []);
  const type =
    values.length > 0
      ? `one of ${values.join(', ')}`
      : (variants.find((variant) => variant.format)?.format ??
        types.filter((t) => t !== 'null').join(' or '));
  const description =
    property.description ?? variants.find((variant) => variant.description)?.description ?? '';
  return `  ${name} (${type}${nullable ? ', nullable' : ''})${description ? `: ${description}` : ''}`;
}

function describeSchema(schema: z.infer<typeof SchemaResponse>) {
  return [
    `Course datasets (API version ${schema.version}). IDs are strings; timestamps are ISO 8601 in UTC. Any column can be filtered (eq, lt, lte, gt, gte, or in with a list of up to ${COURSE_DATA_MAX_IN_VALUES} values), selected, or sorted on.`,
    ...Object.entries(schema.datasets).flatMap(([name, dataset]) => [
      '',
      `${name}: ${dataset.description}`,
      ...Object.entries(dataset.schema.properties).map(([column, property]) =>
        describeColumn(column, property),
      ),
    ]),
  ].join('\n');
}

async function readCapped(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), bytes };
}

async function errorMessage(response: Response) {
  const body = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    // A proxy or load balancer error page, not an API response.
  }
  const parsed = z.object({ message: z.string() }).safeParse(json);
  return parsed.success ? parsed.data.message : response.statusText;
}

/** A filter as the model and logs see it; a long `in` list shows its first values and its size. */
function describeFilter(filter: NonNullable<CourseDataRequest['filters']>[number]) {
  if (filter.op !== 'in' || filter.value.length <= 5) {
    return `${filter.column} ${filter.op} ${JSON.stringify(filter.value)}`;
  }
  const shown = filter.value.slice(0, 5).map((value) => JSON.stringify(value));
  return `${filter.column} in [${shown.join(',')},…] (${filter.value.length} values)`;
}

interface CourseDataContext {
  plUrl: string;
  serviceToken: string;
  conversationId: string;
  courseId: string | undefined;
}

// Longer than PrairieLearn's 60-second statement timeout, so a slow query fails with its reason.
const REQUEST_TIMEOUT_MS = 120_000;

const UNAVAILABLE: ToolReply = {
  success: false,
  text: 'Course data is unavailable. Reload the PrairieLearn page.',
};

/**
 * PrairieLearn identifies the user and course from the conversation, so the model chooses only
 * which rows to read.
 */
function authHeaders({ serviceToken, conversationId }: CourseDataContext) {
  return {
    Authorization: `Bearer ${serviceToken}`,
    'X-Course-Agent-Conversation': conversationId,
  };
}

/** Serves `list_course_datasets` from `GET /pl/api/v1/course/:course_id/data`. */
export async function listCourseDatasets(context: CourseDataContext): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  const response = await fetch(
    new URL(`/pl/api/v1/course/${context.courseId}/data`, context.plUrl),
    { headers: authHeaders(context), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  return { success: true, text: describeSchema(SchemaResponse.parse(await response.json())) };
}

/**
 * Serves `get_course_data` from `POST /pl/api/v1/course/:course_id/data/:dataset`: saves the rows
 * in the sandbox and describes the file.
 */
export async function getCourseData({
  sandbox,
  request,
  ...context
}: CourseDataContext & {
  sandbox: DurableObjectStub<CourseSandbox>;
  request: CourseDataRequest;
}): Promise<ToolReply> {
  if (!context.courseId) return UNAVAILABLE;
  const { dataset, ...query } = request;
  const started = Date.now();
  const response = await fetch(
    new URL(
      `/pl/api/v1/course/${context.courseId}/data/${encodeURIComponent(dataset)}`,
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

  const body = await readCapped(response);
  if (!body) {
    return {
      success: false,
      text: `The result is larger than ${MAX_BYTES / 1024 / 1024} MB. Add filters (such as course_instance_id or assessment_id) or select fewer columns.`,
    };
  }
  // Each row ends with a newline, so count them rather than splitting a copy of the whole body.
  let rows = 0;
  for (let i = body.text.indexOf('\n'); i !== -1; i = body.text.indexOf('\n', i + 1)) rows++;
  const filters = (query.filters ?? []).map(describeFilter);
  const path = await sandbox.writeCourseData(dataset, body.text);
  logEvent('course_data_fetched', {
    conversationId: context.conversationId,
    dataset,
    filters,
    rows,
    bytes: body.bytes,
    elapsedMs: Date.now() - started,
  });
  const firstRow = body.text.slice(0, body.text.indexOf('\n'));
  const columns = rows > 0 ? Object.keys(JSON.parse(firstRow)).join(', ') : 'none';
  const scope =
    filters.length > 0
      ? `Filters: ${filters.join(' AND ')}. The file holds only matching rows.`
      : 'No filters: every row in this course.';
  return {
    success: true,
    text: `Wrote ${rows} rows (${(body.bytes / 1024 / 1024).toFixed(1)} MB) to ${path}. ${scope} Columns: ${columns}.`,
  };
}

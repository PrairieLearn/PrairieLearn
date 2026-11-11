import { z } from 'zod';

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
    `Course datasets (API version ${schema.version}). IDs are strings; timestamps are ISO 8601 in UTC. Any column can be filtered (eq, lt, lte, gt, gte), selected, or sorted on.`,
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

interface CourseDataContext {
  plUrl: string;
  serviceToken: string;
  conversationId: string;
  courseId: string | undefined;
}

/**
 * Calls PrairieLearn's course data API. PrairieLearn identifies the user and course from the
 * conversation, so the model chooses only which rows to read.
 */
async function fetchCourseData(
  { plUrl, serviceToken, conversationId, courseId }: CourseDataContext,
  path: string,
  init: RequestInit = {},
) {
  if (!courseId) return null;
  return await fetch(new URL(`/pl/api/v1/course/${courseId}/data${path}`, plUrl), {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${serviceToken}`,
      'X-Course-Agent-Conversation': conversationId,
    },
    signal: AbortSignal.timeout(120_000),
  });
}

const UNAVAILABLE: ToolReply = {
  success: false,
  text: 'Course data is unavailable. Reload the PrairieLearn page.',
};

/** Serves `list_course_datasets`. */
export async function listCourseDatasets(context: CourseDataContext): Promise<ToolReply> {
  const response = await fetchCourseData(context, '');
  if (!response) return UNAVAILABLE;
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  return { success: true, text: describeSchema(SchemaResponse.parse(await response.json())) };
}

/** Serves `get_course_data`: saves the rows in the sandbox and describes the file. */
export async function getCourseData({
  sandbox,
  request,
  ...context
}: CourseDataContext & {
  sandbox: DurableObjectStub<CourseSandbox>;
  request: CourseDataRequest;
}): Promise<ToolReply> {
  const { dataset, ...query } = request;
  const started = Date.now();
  const response = await fetchCourseData(context, `/${encodeURIComponent(dataset)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!response) return UNAVAILABLE;
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
  const filters = (query.filters ?? []).map(
    (filter) => `${filter.column} ${filter.op} ${JSON.stringify(filter.value)}`,
  );
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

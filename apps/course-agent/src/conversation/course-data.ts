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
const SchemaResponse = z.object({
  version: z.number(),
  tables: z.record(
    z.string(),
    z.object({
      description: z.string(),
      schema: z.object({
        properties: z.record(
          z.string(),
          JsonSchemaProperty.extend({ anyOf: z.array(JsonSchemaProperty).optional() }),
        ),
      }),
    }),
  ),
});

/** One line per column, such as `submitted_at (date-time, nullable): When the student submitted.` */
function describeColumn(
  name: string,
  property: z.infer<typeof SchemaResponse>['tables'][string]['schema']['properties'][string],
) {
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
  return `  ${name} (${type}${nullable ? ', nullable' : ''}): ${description}`;
}

function describeSchema(schema: z.infer<typeof SchemaResponse>) {
  return [
    `Course data tables (API version ${schema.version}). IDs are strings; timestamps are ISO 8601 in UTC.`,
    ...Object.entries(schema.tables).flatMap(([name, table]) => [
      '',
      `${name}: ${table.description}`,
      ...Object.entries(table.schema.properties).map(([column, property]) =>
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
  const parsed = z.object({ message: z.string() }).safeParse(JSON.parse(body || 'null'));
  return parsed.success ? parsed.data.message : body || response.statusText;
}

/**
 * Serves `get_course_data` from PrairieLearn's course data API. PrairieLearn identifies the user
 * and course from the conversation, so the model chooses only which rows to read.
 */
export async function getCourseData({
  plUrl,
  serviceToken,
  conversationId,
  courseId,
  sandbox,
  request,
}: {
  plUrl: string;
  serviceToken: string;
  conversationId: string;
  courseId: string | undefined;
  sandbox: DurableObjectStub<CourseSandbox>;
  request: CourseDataRequest;
}): Promise<ToolReply> {
  if (!courseId) {
    return { success: false, text: 'Course data is unavailable. Reload the PrairieLearn page.' };
  }
  const url = new URL(`/pl/api/v1/course/${courseId}/data`, plUrl);
  if (request.table) url.pathname += `/${encodeURIComponent(request.table)}`;
  for (const filter of request.filters ?? []) {
    const equals = filter.indexOf('=');
    if (equals <= 0) {
      return { success: false, text: `Expected a filter like column=eq.value, not "${filter}".` };
    }
    url.searchParams.append(filter.slice(0, equals).trim(), filter.slice(equals + 1).trim());
  }
  if (request.select) url.searchParams.set('select', request.select.join(','));
  if (request.order) url.searchParams.set('order', request.order);
  if (request.limit !== undefined) url.searchParams.set('limit', String(request.limit));

  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'X-Course-Agent-Conversation': conversationId,
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    return { success: false, text: `${response.status}: ${await errorMessage(response)}` };
  }
  if (!request.table) {
    return { success: true, text: describeSchema(SchemaResponse.parse(await response.json())) };
  }

  const body = await readCapped(response);
  if (!body) {
    return {
      success: false,
      text: `The result is larger than ${MAX_BYTES / 1024 / 1024} MB. Add filters (such as course_instance_id or assessment_id) or select fewer columns.`,
    };
  }
  const rows = body.text.split('\n').filter(Boolean);
  const path = await sandbox.writeCourseData(request.table, body.text);
  logEvent('course_data_fetched', {
    conversationId,
    table: request.table,
    filters: request.filters ?? [],
    rows: rows.length,
    bytes: body.bytes,
    elapsedMs: Date.now() - started,
  });
  const columns = rows.length > 0 ? Object.keys(JSON.parse(rows[0])).join(', ') : 'none';
  const scope = request.filters?.length
    ? `Filters: ${request.filters.join(' AND ')}.`
    : 'No filters: every row in this course.';
  return {
    success: true,
    text: `Wrote ${rows.length} rows (${(body.bytes / 1024 / 1024).toFixed(1)} MB) to ${path}. ${scope} Columns: ${columns}.`,
  };
}

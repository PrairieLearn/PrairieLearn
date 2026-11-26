import { z } from 'zod';

import { COURSE_DATA_MAX_IN_VALUES } from './course-data.js';

const JsonSchemaProperty = z.looseObject({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  format: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  description: z.string().optional(),
});
const ColumnSchema = JsonSchemaProperty.extend({
  anyOf: z.array(JsonSchemaProperty).optional(),
});
/** What PrairieLearn answers when asked which course datasets exist. */
export const CourseDataSchemaResponse = z.object({
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

/** The datasets and their columns as text for a model, as `list_course_datasets` returns them. */
export function describeCourseDatasets(schema: z.infer<typeof CourseDataSchemaResponse>) {
  return [
    `Course datasets (API version ${schema.version}). IDs are strings; timestamps are ISO 8601 in UTC, so convert them to the course instance's display_timezone before grouping by day. Results carry course_instance_short_name, assessment_tid, and qid, the directory names in the course files, so filter by those rather than looking up IDs. Select the columns you need; any column can be filtered (eq, lt, lte, gt, gte, or in with a list of up to ${COURSE_DATA_MAX_IN_VALUES} values) or sorted on.`,
    ...Object.entries(schema.datasets).flatMap(([name, dataset]) => [
      '',
      `${name}: ${dataset.description}`,
      ...Object.entries(dataset.schema.properties).map(([column, property]) =>
        describeColumn(column, property),
      ),
    ]),
  ].join('\n');
}

import { z } from 'zod';

/** Operators that compare a column with one value. */
export const COURSE_DATA_COMPARISONS = ['eq', 'lt', 'lte', 'gt', 'gte'] as const;

/** The most values an `in` filter takes; a longer list is better filtered after downloading. */
export const COURSE_DATA_MAX_IN_VALUES = 1000;

const CourseDataValueSchema = z.union([z.string(), z.number(), z.boolean()]);

/**
 * A request for rows of one course dataset. PrairieLearn validates it with `column` limited to the
 * dataset's columns; the course agent uses it with any column name as its tool's arguments.
 */
export function courseDataQuerySchema<Column extends z.ZodType<string>>(column: Column) {
  return z.strictObject({
    filters: z
      .array(
        z.discriminatedUnion('op', [
          z.strictObject({
            column,
            op: z.enum(COURSE_DATA_COMPARISONS),
            value: CourseDataValueSchema,
          }),
          z.strictObject({
            column,
            op: z.literal('in'),
            value: z.array(CourseDataValueSchema).min(1).max(COURSE_DATA_MAX_IN_VALUES),
          }),
        ]),
      )
      .optional()
      .describe('Conditions that every row must meet.'),
    select: z
      .array(column)
      .min(1)
      .describe(
        'Columns to include. Large columns are slower to read, so select only those needed.',
      ),
    order: z
      .array(z.strictObject({ column, direction: z.enum(['asc', 'desc']) }))
      .optional()
      .describe('Sort order, most significant first.'),
    limit: z.number().int().positive().optional().describe('Maximum number of rows.'),
  });
}

export const CourseDataQuerySchema = courseDataQuerySchema(z.string());

export type CourseDataQuery = z.infer<typeof CourseDataQuerySchema>;

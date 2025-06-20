import { z } from 'zod';

import type { Course, CourseInstance } from '../db-types.js';

const ResLocalsSchema = z.object({
  authz_data: z.object({
    has_course_instance_permission_edit: z.boolean(),
    has_course_instance_permission_view: z.boolean(),
    has_course_permission_own: z.boolean(),
  }),
  course_instance: z.custom<CourseInstance>(),
  course: z.custom<Course>(),
  urlPrefix: z.string(),
});

export type ResLocals = z.infer<typeof ResLocalsSchema>;

/**
 * Parses and validates resLocals data, stripping any fields that aren't in the schema.
 * @param data - The raw data to parse
 * @returns Parsed and validated ResLocals object
 */
export function stripResLocals(data: Record<string, any>): ResLocals {
  return ResLocalsSchema.parse(data);
}

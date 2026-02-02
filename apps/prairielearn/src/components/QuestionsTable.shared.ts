import { z } from 'zod';

import {
  RawPublicCourseInstanceSchema,
  RawPublicSharingSetSchema,
  RawPublicTagSchema,
  RawPublicTopicSchema,
} from '../lib/client/safe-db-types.js';

/**
 * Schema for question data used in the QuestionsTable component.
 * This is a client-safe version of QuestionsPageData from the models.
 */
export const QuestionsPageDataSchema = z.object({
  assessments: z
    .array(
      z.object({
        assessment_id: z.string(),
        color: z.string(),
        course_instance_id: z.string(),
        label: z.string(),
        share_source_publicly: z.boolean(),
      }),
    )
    .nullable()
    .optional(),
  display_type: z.string(),
  external_grading_image: z.string().nullable(),
  grading_method: z.string(),
  id: z.string(),
  open_issue_count: z.number().default(0),
  qid: z.string(),
  share_publicly: z.boolean(),
  share_source_publicly: z.boolean(),
  sharing_sets: z.array(RawPublicSharingSetSchema).nullable().optional(),
  sync_errors: z.string().nullable().optional(),
  sync_warnings: z.string().nullable().optional(),
  tags: z.array(RawPublicTagSchema).nullable(),
  title: z.string(),
  topic: RawPublicTopicSchema,
  workspace_image: z.string().nullable(),
});

export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

export const CourseInstanceSchema = RawPublicCourseInstanceSchema.pick({
  id: true,
  short_name: true,
}).extend({
  // Override short_name to be non-nullable since we only show course instances with names
  short_name: z.string(),
});

export type CourseInstance = z.infer<typeof CourseInstanceSchema>;

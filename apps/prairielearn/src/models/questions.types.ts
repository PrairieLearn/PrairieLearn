import { z } from 'zod';

import {
  AssessmentSchema,
  AssessmentSetSchema,
  QuestionSchema,
  SharingSetSchema,
  TagSchema,
  TopicSchema,
} from '../lib/db-types.js';

export const QuestionsPageDataSchema = QuestionSchema.pick({
  id: true,
  grading_method: true,
  external_grading_image: true,
  workspace_image: true,
  share_publicly: true,
  share_source_publicly: true,
}).extend({
  // These are non-nullable in this context because the queries filter out draft questions.
  qid: z.string(),
  title: z.string(),
  // The public questions query does not select these columns, so they must be optional.
  sync_errors: QuestionSchema.shape.sync_errors.optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings.optional(),
  display_type: z.string(),
  open_issue_count: z.number().default(0),
  topic: TopicSchema,
  tags: z.array(TagSchema).nullable(),
  sharing_sets: z.array(SharingSetSchema).nullable().optional(),
  assessments: z
    .array(
      z.object({
        assessment: AssessmentSchema.pick({
          id: true,
          course_instance_id: true,
          number: true,
        }),
        assessment_set: AssessmentSetSchema.pick({
          abbreviation: true,
          color: true,
        }),
      }),
    )
    // The public questions endpoint does not have assessments, so we need to make this optional.
    .optional(),
});
export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

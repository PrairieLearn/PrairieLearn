import { z } from 'zod';

import {
  SharingSetSchema,
  SprocAssessmentsFormatForQuestionSchema,
  TagSchema,
  TopicSchema,
} from '../lib/db-types.js';

export const QuestionsPageDataSchema = z.object({
  id: z.string(),
  qid: z.string(),
  title: z.string(),
  sync_errors: z.string().nullable().optional(),
  sync_warnings: z.string().nullable().optional(),
  grading_method: z.string(),
  external_grading_image: z.string().nullable(),
  workspace_image: z.string().nullable(),
  display_type: z.string(),
  open_issue_count: z.number().default(0),
  topic: TopicSchema,
  tags: z.array(TagSchema).nullable(),
  share_publicly: z.boolean(),
  share_source_publicly: z.boolean(),
  sharing_sets: z.array(SharingSetSchema).nullable().optional(),
  assessments: SprocAssessmentsFormatForQuestionSchema.nullable().optional(),
});
export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

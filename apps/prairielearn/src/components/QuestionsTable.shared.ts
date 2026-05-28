import { z } from 'zod';

import {
  PublicSharingSetSchema,
  PublicTagSchema,
  PublicTopicSchema,
} from '../lib/client/safe-db-types.js';
import { QuestionsPageDataSchema } from '../models/questions.types.js';

export const MAX_BULK_QUESTION_SELECTION = 500;

/**
 * Client-safe schema for question data. Replaces full TopicSchema/TagSchema/SharingSetSchema
 * with their public counterparts, stripping fields like `id` and `course_id` that
 * shouldn't be sent to the client.
 *
 * We can't collapse this into QuestionsPageDataSchema because server-side consumers
 * (e.g. the assessment questions picker in instructorAssessmentQuestions/trpc.ts) need
 * the full topic/tag data including `id` fields.
 */
export const SafeQuestionsPageDataSchema = QuestionsPageDataSchema.omit({
  topic: true,
  tags: true,
  sharing_sets: true,
}).extend({
  topic: PublicTopicSchema,
  tags: z.array(PublicTagSchema).nullable(),
  // Sharing sets are only present on the instructor page (when question_sharing_enabled is true).
  // The public questions page does not include sharing set data.
  sharing_sets: z.array(PublicSharingSetSchema).nullable().optional(),
});

export type SafeQuestionsPageData = z.infer<typeof SafeQuestionsPageDataSchema>;

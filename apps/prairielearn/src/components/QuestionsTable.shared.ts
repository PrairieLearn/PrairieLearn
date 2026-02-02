import { z } from 'zod';

import {
  PublicSharingSetSchema,
  PublicTagSchema,
  PublicTopicSchema,
  RawPublicCourseInstanceSchema,
} from '../lib/client/safe-db-types.js';
import { QuestionsPageDataSchema } from '../models/questions.types.js';

/**
 * Schema for question data used in the QuestionsTable component.
 */
export const SafeQuestionsPageDataSchema = QuestionsPageDataSchema.omit({
  topic: true,
  tags: true,
  sharing_sets: true,
}).extend({
  topic: PublicTopicSchema,
  tags: z.array(PublicTagSchema).nullable(),
  sharing_sets: z.array(PublicSharingSetSchema).nullable().optional(),
});

export type SafeQuestionsPageData = z.infer<typeof SafeQuestionsPageDataSchema>;

export const CourseInstanceSchema = RawPublicCourseInstanceSchema.pick({
  id: true,
  short_name: true,
}).extend({
  // Override short_name to be non-nullable since we only show course instances with names
  short_name: z.string(),
});

export type CourseInstance = z.infer<typeof CourseInstanceSchema>;

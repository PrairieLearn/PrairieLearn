import { z } from 'zod';

import {
  PublicSharingSetSchema,
  PublicTagSchema,
  PublicTopicSchema,
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

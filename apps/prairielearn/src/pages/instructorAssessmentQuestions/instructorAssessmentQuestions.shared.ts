import { z } from 'zod';

import {
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionJsonSchema,
} from '../../schemas/infoAssessment.js';

/**
 * Form version of QuestionAlternativeJson - adds trackingId for stable drag-and-drop identity.
 */
export const QuestionAlternativeFormSchema = QuestionAlternativeJsonSchema.extend({
  trackingId: z.string(),
});
export type QuestionAlternativeForm = z.infer<typeof QuestionAlternativeFormSchema>;

/**
 * Form version of ZoneQuestionJson - adds trackingId, updates alternatives type.
 */
export const ZoneQuestionFormSchema = ZoneQuestionJsonSchema.omit({ alternatives: true }).extend({
  trackingId: z.string(),
  alternatives: z.array(QuestionAlternativeFormSchema).min(1).optional(),
});
export type ZoneQuestionForm = z.infer<typeof ZoneQuestionFormSchema>;

/**
 * Form version of ZoneAssessmentJson - updates questions type.
 */
export const ZoneAssessmentFormSchema = ZoneAssessmentJsonSchema.omit({ questions: true }).extend({
  questions: z.array(ZoneQuestionFormSchema).min(1),
});
export type ZoneAssessmentForm = z.infer<typeof ZoneAssessmentFormSchema>;

import { z } from 'zod';

import {
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionBlockJsonSchema,
} from '../../schemas/infoAssessment.js';

/**
 * Branded UUID type for stable drag-and-drop identity.
 * Using a branded type prevents accidental confusion with question IDs (QIDs).
 */
export const TrackingIdSchema = z.string().uuid().brand<'TrackingId'>();
export type TrackingId = z.infer<typeof TrackingIdSchema>;

/**
 * Form version of QuestionAlternativeJson - adds trackingId for stable drag-and-drop identity.
 */
export const QuestionAlternativeFormSchema = QuestionAlternativeJsonSchema.extend({
  trackingId: TrackingIdSchema,
});
export type QuestionAlternativeForm = z.infer<typeof QuestionAlternativeFormSchema>;

/**
 * Form version of ZoneQuestionBlockJson - adds trackingId, updates alternatives type.
 */
export const ZoneQuestionBlockFormSchema = ZoneQuestionBlockJsonSchema.omit({
  alternatives: true,
}).extend({
  trackingId: TrackingIdSchema,
  alternatives: z.array(QuestionAlternativeFormSchema).min(1).optional(),
});
export type ZoneQuestionBlockForm = z.infer<typeof ZoneQuestionBlockFormSchema>;

/**
 * Form version of ZoneAssessmentJson - adds trackingId, updates questions type.
 */
export const ZoneAssessmentFormSchema = ZoneAssessmentJsonSchema.omit({ questions: true }).extend({
  trackingId: TrackingIdSchema,
  questions: z.array(ZoneQuestionBlockFormSchema),
});
export type ZoneAssessmentForm = z.infer<typeof ZoneAssessmentFormSchema>;

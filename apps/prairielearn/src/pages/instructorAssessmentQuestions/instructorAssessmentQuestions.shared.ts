import { z } from 'zod';

import {
  QuestionAlternativeJsonSchema,
  ZoneAssessmentJsonSchema,
  ZoneQuestionJsonSchema,
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
 * Form version of ZoneQuestionJson - adds trackingId, updates alternatives type.
 */
export const ZoneQuestionFormSchema = ZoneQuestionJsonSchema.omit({ alternatives: true }).extend({
  trackingId: TrackingIdSchema,
  alternatives: z.array(QuestionAlternativeFormSchema).min(1).optional(),
});
export type ZoneQuestionForm = z.infer<typeof ZoneQuestionFormSchema>;

/**
 * Form version of ZoneAssessmentJson - adds trackingId, updates questions type.
 */
export const ZoneAssessmentFormSchema = ZoneAssessmentJsonSchema.omit({ questions: true }).extend({
  trackingId: TrackingIdSchema,
  questions: z.array(ZoneQuestionFormSchema),
});
export type ZoneAssessmentForm = z.infer<typeof ZoneAssessmentFormSchema>;

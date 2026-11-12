import { z } from 'zod';

import { StaffQuestionSchema, StaffUserSchema } from './safe-db-types.js';

export const QuestionAuthorshipReportQuestionSchema = StaffQuestionSchema.pick({
  id: true,
  qid: true,
  title: true,
  deleted_at: true,
  draft: true,
}).extend({
  provenance_status: z.enum(['absent', 'resolved', 'unresolved']),
  downstream_course_count: z.number().int().nonnegative(),
  downstream_institution_count: z.number().int().nonnegative(),
});

const QuestionAuthorshipReportAuthorSchema = z.object({
  uid: StaffUserSchema.shape.uid,
  display_name: z.string(),
  question_count: z.number().int().nonnegative(),
});

// Downstream courses and institutions are exposed only as counts.
export const QuestionAuthorshipReportSchema = z.object({
  authors: z.array(QuestionAuthorshipReportAuthorSchema),
  author: QuestionAuthorshipReportAuthorSchema.nullable(),
  questions: z.array(QuestionAuthorshipReportQuestionSchema),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
});

export type QuestionAuthorshipReport = z.infer<typeof QuestionAuthorshipReportSchema>;

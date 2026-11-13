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

// Counts are the only downstream information exposed to clients. In
// particular, do not include downstream question/course/institution IDs or metadata.
export const QuestionAuthorshipReportSchema = z.array(
  z.object({
    uid: StaffUserSchema.shape.uid,
    display_name: z.string(),
    questions: z.array(QuestionAuthorshipReportQuestionSchema),
  }),
);

export type QuestionAuthorshipReport = z.infer<typeof QuestionAuthorshipReportSchema>;

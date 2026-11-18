import z from 'zod';

// Only data crosses the port. Signals, promises, and callbacks belong to the
// adapters on either side; IDs associate messages with those local objects.
const id = z.number().int().nonnegative();
export const QuestionServiceRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-copy-question'), id }),
  z.object({ type: z.literal('open-submission-info'), id, submissionId: z.string() }),
  z.object({
    type: z.literal('render'),
    id,
    submissionId: z.string(),
    purpose: z.enum(['history', 'grading-result']),
  }),
  z.object({ type: z.literal('cancel'), id }),
  z.object({ type: z.literal('subscribe'), id }),
  z.object({ type: z.literal('unsubscribe'), id }),
  z.object({
    type: z.literal('submit-answer'),
    id,
    action: z.enum(['save', 'grade']),
    entries: z.array(z.tuple([z.string(), z.string()])),
  }),
  z.object({
    type: z.literal('navigate'),
    id,
    target: z.enum(['new-variant', 'try-again', 'manual-grading-preview', 'ai-grading-preview']),
  }),
  z.object({ type: z.literal('answer-state'), dirty: z.boolean() }),
  z.object({ type: z.literal('dispose') }),
]);
export type QuestionServiceRequest = z.infer<typeof QuestionServiceRequestSchema>;

export const QuestionServiceResponseSchema = z.discriminatedUnion('type', [
  // Completes requests without data: dialogs closed, answers submitted, navigation started.
  z.object({ type: z.literal('done'), id }),
  z.object({
    type: z.literal('result'),
    id,
    panels: z.object({
      submissionPanel: z.string().nullable(),
      extraHeadersHtml: z.string().nullable(),
      answerPanel: z.string().nullish(),
      questionPanelFooter: z.string().nullish(),
    }),
  }),
  z.object({ type: z.literal('error'), id, code: z.enum(['aborted', 'failed']) }),
  z.object({
    type: z.literal('status'),
    id,
    submissions: z.array(
      z.object({
        id: z.string(),
        grading_job_id: z.string().nullable().default(null),
        grading_job_status: z.enum([
          'none',
          'canceled',
          'queued',
          'grading',
          'graded',
          'requested',
        ]),
      }),
    ),
  }),
  z.object({ type: z.literal('dispose') }),
]);
export type QuestionServiceResponse = z.input<typeof QuestionServiceResponseSchema>;

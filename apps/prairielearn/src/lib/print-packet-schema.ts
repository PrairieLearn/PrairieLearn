import { z } from 'zod';

import { PAPER_SIZES, QUESTION_BLOCK_SIZES } from '@prairielearn/printing';
import { IdSchema } from '@prairielearn/zod';

import { MAX_PRINT_COPIES, MAX_PRINT_INSTANCES } from './client/print-packet.js';
import { PrintIdentityFieldsTextSchema } from './client/print-preparation.js';

const QuestionNumberSchema = z.string().regex(/^[1-9]\d*$/);
const PrintSettingsSchema = z.strictObject({
  paperSize: z.enum(PAPER_SIZES),
  identityFields: PrintIdentityFieldsTextSchema,
  blockSize: z.enum(QUESTION_BLOCK_SIZES),
  questionSizes: z.record(
    QuestionNumberSchema,
    z.union([z.enum(QUESTION_BLOCK_SIZES), z.literal('')]),
  ),
  excludedQuestions: QuestionNumberSchema.array().refine(
    (numbers) => new Set(numbers).size === numbers.length,
  ),
});

export const PrintPacketMetadataSchema = z.strictObject({
  instances: z
    .array(
      z.strictObject({
        assessmentInstanceId: IdSchema,
        formLabel: z.string().regex(/^[A-Z]$/),
        settings: PrintSettingsSchema,
      }),
    )
    .min(1)
    .max(MAX_PRINT_INSTANCES)
    .refine(
      (instances) =>
        new Set(instances.map((instance) => instance.assessmentInstanceId)).size ===
        instances.length,
      'Select each assessment instance only once.',
    )
    .refine(
      (instances) =>
        new Set(instances.map((instance) => instance.formLabel)).size === instances.length,
      'Each assessment instance must have a different form label.',
    ),
  copies: z.number().int().min(1).max(MAX_PRINT_COPIES),
  document: z.enum(['exam', 'answer_key', 'booklet']),
});

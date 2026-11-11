import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { MAX_PRINT_COPIES, MAX_PRINT_FORMS } from '../client/printing/print-packet.js';
import { PrintIdentityFieldsTextSchema } from '../client/printing/print-preparation.js';

import { PAPER_SIZES } from './paper-size.js';
import { QUESTION_BLOCK_SIZES } from './question-block-size.js';

const QuestionNumberSchema = z.string().min(1);
const PrintSettingsSchema = z.strictObject({
  paperSize: z.enum(PAPER_SIZES),
  includeCoverPage: z.boolean().default(true),
  includeGradingTable: z.boolean().default(false),
  includeHonorCode: z.boolean().default(true),
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
export type PrintSettings = z.infer<typeof PrintSettingsSchema>;

export const PrintPacketMetadataSchema = z.strictObject({
  forms: z
    .array(
      z.strictObject({
        printFormId: IdSchema,
        settings: PrintSettingsSchema,
      }),
    )
    .min(1)
    .max(MAX_PRINT_FORMS)
    .refine(
      (forms) => new Set(forms.map((form) => form.printFormId)).size === forms.length,
      'Select each print form only once.',
    ),
  copies: z.number().int().min(1).max(MAX_PRINT_COPIES),
  document: z.enum(['assessment', 'answer_key', 'booklet']),
});

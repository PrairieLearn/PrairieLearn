import { z } from 'zod';

import { PrintIdentityFieldsTextSchema } from '../client/printing/print-cover.js';

import { PAPER_SIZES } from './paper-size.js';
import { QUESTION_BLOCK_SIZES } from './question-block-size.js';

const QuestionNumberSchema = z.string().min(1);

export const PrintSettingsSchema = z.strictObject({
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

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'Letter',
  includeCoverPage: true,
  includeGradingTable: false,
  includeHonorCode: true,
  identityFields: 'Student ID\nSection',
  blockSize: 'auto',
  questionSizes: {},
  excludedQuestions: [],
};

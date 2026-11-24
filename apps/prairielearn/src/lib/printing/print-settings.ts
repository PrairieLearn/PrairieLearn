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

export const PRINT_SETTINGS_CHANGED_MESSAGE =
  'This form’s settings changed while you were editing. Your edits are still here; review them and select Update preview again.';
export const PRINT_PAPER_SIZE_SHARED_MESSAGE =
  'Paper size must be changed for all current forms together. Reload this page, then choose a paper size again.';
export const PRINT_PAPER_SIZES_MISMATCH_MESSAGE =
  'Current forms use different paper sizes. Choose a paper size for all forms before downloading.';
export const PRINT_QUESTION_SELECTION_LOCKED_MESSAGE =
  'This form’s question selection is fixed after you start a download. Reload the page, then select a question to create a new numbered version.';

export function sameExcludedQuestions(left: readonly string[], right: readonly string[]): boolean {
  const selected = new Set(right);
  return left.length === right.length && left.every((number) => selected.has(number));
}

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

/** Saves one setting on the current form. */
export type SavePrintSetting = <K extends keyof PrintSettings>(
  field: K,
  value: PrintSettings[K],
) => Promise<void>;

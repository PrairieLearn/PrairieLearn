import { z } from 'zod';

import type { PaperSize, QuestionBlockSize } from '@prairielearn/printing';

export interface PrintPreparationQuestion {
  number: string;
  title: string;
  questionId: string;
  points: number;
  concerns: string[];
}

export interface PrintSettings {
  paperSize: PaperSize;
  identityFields: string;
  blockSize: QuestionBlockSize;
  questionSizes: Record<string, QuestionBlockSize | ''>;
  excludedQuestions: string[];
}

export type PrintDocument = 'exam' | 'answer_key';

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'Letter',
  identityFields: 'Student ID\nSection',
  blockSize: 'auto',
  questionSizes: {},
  excludedQuestions: [],
};

export const BLOCK_SIZE_LABELS: Record<QuestionBlockSize, string> = {
  auto: 'Fit to content',
  third: 'One third of a page',
  half: 'Half a page',
  full: 'A full page',
};

function printIdentityFields(value: string): string[] {
  return value
    .split('\n')
    .map((field) => field.trim())
    .filter(Boolean);
}

export const PrintIdentityFieldsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(40, 'Keep each additional student information label to 40 characters or fewer.'),
  )
  .max(6, 'Use at most six additional student information labels.')
  .refine(
    (fields) => !fields.some((field) => ['name', 'date'].includes(field.toLowerCase())),
    'Name and Date are already included on the cover page.',
  )
  .refine(
    (fields) => new Set(fields.map((field) => field.toLowerCase())).size === fields.length,
    'Use a different label for each additional student information field.',
  );

export const PrintIdentityFieldsTextSchema = z
  .string()
  .transform(printIdentityFields)
  .pipe(PrintIdentityFieldsSchema)
  .transform((fields) => fields.join('\n'));

export function printLayoutSearch(settings: PrintSettings): string {
  const search = new URLSearchParams({
    paper_size: settings.paperSize,
    block_size: settings.blockSize,
  });
  for (const field of printIdentityFields(settings.identityFields)) {
    search.append('identity_field', field);
  }
  for (const [number, size] of Object.entries(settings.questionSizes)) {
    if (size) search.append('question_block_size', `${number}:${size}`);
  }
  for (const number of settings.excludedQuestions) {
    search.append('exclude_question', number);
  }
  return search.toString();
}

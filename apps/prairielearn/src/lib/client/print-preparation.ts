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
}

export type PrintDocument = 'exam' | 'answer_key';

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'Letter',
  identityFields: 'Student ID\nSection',
  blockSize: 'auto',
  questionSizes: {},
};

export const BLOCK_SIZE_LABELS: Record<QuestionBlockSize, string> = {
  auto: 'Fit to content',
  third: 'One third of a page',
  half: 'Half a page',
  full: 'A full page',
};

export function printIdentityFields(value: string): string[] {
  return value
    .split('\n')
    .map((field) => field.trim())
    .filter(Boolean);
}

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
  return search.toString();
}

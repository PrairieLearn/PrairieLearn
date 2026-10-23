export type QuestionBlockSize = 'auto' | 'third' | 'half' | 'full';

export const QUESTION_BLOCK_SIZES = [
  'auto',
  'third',
  'half',
  'full',
] as const satisfies readonly QuestionBlockSize[];

const QUESTION_BLOCK_SIZE_SET: ReadonlySet<string> = new Set(QUESTION_BLOCK_SIZES);

function isQuestionBlockSize(value: string): value is QuestionBlockSize {
  return QUESTION_BLOCK_SIZE_SET.has(value);
}

export function parseQuestionBlockSize(value: string | undefined): QuestionBlockSize {
  if (value == null || value === '') return 'auto';
  if (isQuestionBlockSize(value)) return value;
  throw new Error(
    `Invalid print block size ${JSON.stringify(value)}. Expected auto, third, half, or full.`,
  );
}

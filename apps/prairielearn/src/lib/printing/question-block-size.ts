export type QuestionBlockSize = 'auto' | 'third' | 'half' | 'full';

const QUESTION_BLOCK_SIZE_LOOKUP = {
  auto: true,
  third: true,
  half: true,
  full: true,
} satisfies Record<QuestionBlockSize, true>;

function isQuestionBlockSize(value: string): value is QuestionBlockSize {
  return Object.hasOwn(QUESTION_BLOCK_SIZE_LOOKUP, value);
}

export function parseQuestionBlockSize(value: string | undefined): QuestionBlockSize {
  if (value == null || value === '') return 'auto';
  if (isQuestionBlockSize(value)) return value;
  throw new Error(
    `Invalid print block size ${JSON.stringify(value)}. Expected auto, third, half, or full.`,
  );
}

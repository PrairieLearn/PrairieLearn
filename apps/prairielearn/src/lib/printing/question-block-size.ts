export type QuestionBlockSize = 'auto' | 'third' | 'half' | 'full';

export const QUESTION_BLOCK_SIZES = [
  'auto',
  'third',
  'half',
  'full',
] as const satisfies readonly QuestionBlockSize[];

export const QUESTION_BLOCK_SIZES = ['auto', 'third', 'half', 'full'] as const;

export type QuestionBlockSize = (typeof QUESTION_BLOCK_SIZES)[number];

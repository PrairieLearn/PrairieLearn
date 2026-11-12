import { z } from 'zod';

const MAX_QUESTION_AUTHORS = 100;

const QuestionAuthorUidSchema = z.string().trim().min(1, 'Author UID must not be blank');

export const QuestionAuthorUidsSchema = z
  .array(QuestionAuthorUidSchema)
  .max(MAX_QUESTION_AUTHORS, 'A question can have at most 100 authors')
  .transform((uids) => [...new Set(uids)]);

import { z } from 'zod';

const QuestionAuthorUidSchema = z.string().trim().min(1, 'Author UID must not be blank');

export const QuestionAuthorUidsSchema = z
  .array(QuestionAuthorUidSchema)
  .transform((uids) => [...new Set(uids)]);

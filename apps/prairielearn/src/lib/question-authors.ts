import { z } from 'zod';

export const QuestionAuthorUidSchema = z.string().trim().min(1, 'Author UID must not be blank');

export const QuestionAuthorUidsSchema = z
  .array(QuestionAuthorUidSchema)
  .transform((uids) => [...new Set(uids)]);

interface LegacyQuestionAuthor {
  name?: string;
  email?: string;
  orcid?: string;
  originCourse?: string;
}

/** Kept separate so legacy conversion can be removed after course files are migrated. */
export function normalizeQuestionAuthors(authors: (string | LegacyQuestionAuthor)[]) {
  const uids = new Set<string>();
  const warnings = new Set<string>();
  for (const author of authors) {
    if (typeof author === 'string') {
      uids.add(author.trim());
    } else if (author.email && QuestionAuthorUidSchema.safeParse(author.email).success) {
      uids.add(author.email.trim());
    } else {
      warnings.add(
        `Legacy author ${JSON.stringify(author)} cannot be converted to a UID because it has no usable email. Replace this entry with the author's UID in info.json.`,
      );
    }
  }
  return { uids: [...uids], warnings: [...warnings] };
}

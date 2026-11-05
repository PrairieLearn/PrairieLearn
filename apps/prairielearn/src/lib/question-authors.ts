import { z } from 'zod';

/** Returns a canonical URL only for ORCID identifiers with a valid checksum. */
export function getOrcidUrl(value: string): string | null {
  const match = /^https?:\/\/orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\/?$/i.exec(value.trim());
  if (!match) return null;
  const id = match[1].toUpperCase();
  const digits = id.replaceAll('-', '');
  // ISO 7064 MOD 11-2: https://support.orcid.org/hc/en-us/articles/360006897674
  let total = 0;
  for (const digit of digits.slice(0, -1)) total = (total + Number(digit)) * 2;
  const checksum = (12 - (total % 11)) % 11;
  if (digits.at(-1) !== (checksum === 10 ? 'X' : String(checksum))) return null;
  return `https://orcid.org/${id}`;
}

export const QuestionAuthorSchema = z
  .string()
  .trim()
  .min(1, 'Enter an author UID or ORCID URL')
  .refine(
    (value) => !/^https?:\/\/orcid\.org(?:[/:?#]|$)/i.test(value) || getOrcidUrl(value) !== null,
    'Check the ORCID URL and its identifier. Use https://orcid.org/ followed by a valid ORCID iD.',
  )
  .transform((value) => getOrcidUrl(value) ?? value);

export const QuestionAuthorsSchema = z
  .array(QuestionAuthorSchema)
  .transform((authors) => [...new Set(authors)]);

interface LegacyQuestionAuthor {
  name?: string;
  email?: string;
  orcid?: string;
  originCourse?: string;
}

/** Kept separate so legacy conversion can be removed after course files are migrated. */
export function normalizeQuestionAuthors(authors: (string | LegacyQuestionAuthor)[]) {
  const identifiers = new Set<string>();
  const warnings = new Set<string>();
  for (const author of authors) {
    if (typeof author === 'string') {
      identifiers.add(getOrcidUrl(author) ?? author.trim());
      continue;
    }
    const email = QuestionAuthorSchema.safeParse(author.email);
    if (email.success) identifiers.add(email.data);
    const orcidUrl = author.orcid ? getOrcidUrl(`https://orcid.org/${author.orcid}`) : null;
    if (orcidUrl) identifiers.add(orcidUrl);
    if (author.orcid && !orcidUrl) {
      warnings.add(
        `Legacy author ${JSON.stringify(author)} has an invalid ORCID iD. Correct it in info.json before converting this entry.`,
      );
    } else if (!email.success && !orcidUrl) {
      warnings.add(
        `Legacy author ${JSON.stringify(author)} has no usable email or ORCID iD. Replace this entry with the author's UID or ORCID URL in info.json.`,
      );
    }
  }
  return { identifiers: [...identifiers], warnings: [...warnings] };
}

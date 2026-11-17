import { z } from 'zod';

const UNESCAPED_DOT_REGEXP = /(^|[^\\])(?:\\\\)*\./u;

export const UidRegexpSchema = z
  .string()
  .trim()
  .refine(
    (uidRegexp) => {
      if (uidRegexp.length === 0) return true;

      try {
        new RegExp(uidRegexp, 'u');
      } catch {
        return false;
      }

      return true;
    },
    { message: 'UID regexp must be a valid regular expression.' },
  )
  .refine(
    (uidRegexp) => uidRegexp.length === 0 || (uidRegexp.startsWith('@') && uidRegexp.endsWith('$')),
    { message: 'UID regexp must start with @ and end with $.' },
  )
  .refine((uidRegexp) => !UNESCAPED_DOT_REGEXP.test(uidRegexp), {
    message: 'Periods in UID regexp must be escaped as \\.',
  });

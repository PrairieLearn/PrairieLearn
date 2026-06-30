import { z } from 'zod';

export const INVALID_UID_REGEXP_MESSAGE = 'UID regexp must be a valid regular expression.';

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
    { message: INVALID_UID_REGEXP_MESSAGE },
  );

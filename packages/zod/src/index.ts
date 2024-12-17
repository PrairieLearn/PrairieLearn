import { z } from 'zod';

/**
 * A Zod schema for a boolean from a single checkbox input in the body
 * parameters from a form. This will return a boolean with a value of `true` if
 * the checkbox is checked (the input is present) and `false` if it is not
 * checked.
 */
export const BooleanFromCheckboxSchema = z
  .string()
  .optional()
  .transform((s) => !!s);

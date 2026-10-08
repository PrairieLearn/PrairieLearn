import { z } from 'zod';

export const PrintIdentityFieldsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(40, 'Keep each additional student information label to 40 characters or fewer.'),
  )
  .max(6, 'Use at most six additional student information labels.')
  .refine(
    (fields) => !fields.some((field) => ['name', 'date'].includes(field.toLowerCase())),
    'Name and Date are already included on the cover page.',
  )
  .refine(
    (fields) => new Set(fields.map((field) => field.toLowerCase())).size === fields.length,
    'Use a different label for each additional student information field.',
  );

export const PrintGradingTableSchema = z.object({
  questionNumbers: z.string().array(),
  rowsPerColumn: z.number().int().positive(),
});

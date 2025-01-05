import { z, ZodType } from 'zod';

export function uniqueArray(schema: ZodType) {
  return z.array(schema).refine((items) => new Set(items).size === items.length, {
    message: 'All items must be unique, no duplicate values allowed',
  });
}

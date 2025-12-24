import { z } from 'zod';

import { IdSchema } from '../../lib/db-types.js';

export const StudentGroupRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  student_count: z.coerce.number(),
});
export type StudentGroupRow = z.infer<typeof StudentGroupRowSchema>;

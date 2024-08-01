import { z } from 'zod';

export const AdministratorQueryResultSchema = z.object({
  rows: z.record(z.any()).array(),
  columns: z.string().array(),
});
export type AdministratorQueryResult = z.infer<typeof AdministratorQueryResultSchema>;

import { z } from 'zod';

const FieldSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean']),
    default: z.union([z.string(), z.number(), z.boolean()]),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .strict();

export const QuestionPreferencesSchemaJsonSchema = z.record(z.string().min(1), FieldSchema);

export type QuestionPreferencesSchemaJson = z.infer<typeof QuestionPreferencesSchemaJsonSchema>;

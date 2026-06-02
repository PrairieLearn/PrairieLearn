import { z } from 'zod';

// This schema is intentionally a subset of JSON Schema. The `type`, `default`,
// and `enum` keys map directly to their JSON Schema equivalents, which allows
// the syncing code to pass preference field definitions directly to AJV for
// validation of assessment-level overrides. If new keys are added here, they
// must either be valid JSON Schema keywords or the AJV validation in
// `assessments.ts` (`mergeAndValidatePreferences`) must be updated to construct
// the JSON Schema explicitly.
//
// Not expressed as a union of more precise types because `ajv` doesn't present
// errors in a sensible way if we do that. Instead, we perform validation
// manually in the syncing code (e.g., checking that `default` matches `type`).
const QuestionPreferencesFieldSchema = z
  .object({
    default: z.union([z.string(), z.number(), z.boolean()]),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    type: z.enum(['boolean', 'number', 'string']),
  })
  .strict();

export const QuestionPreferencesSchemaJsonSchema = z.record(
  z.string().min(1),
  QuestionPreferencesFieldSchema,
);
export type QuestionPreferencesSchemaJson = z.infer<typeof QuestionPreferencesSchemaJsonSchema>;

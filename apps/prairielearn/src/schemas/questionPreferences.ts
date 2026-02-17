import { z } from 'zod';

// These types are the valid types which a preference key can be
const StringType = z
  .object({
    type: z.literal('string'),
    default: z.string(),
  })
  .strict();

const NumberType = z
  .object({
    type: z.literal('number'),
    default: z.number(),
  })
  .strict();

const BooleanType = z
  .object({
    type: z.literal('boolean'),
    default: z.boolean(),
  })
  .strict();

// For Enums, we ensure 'default' matches the allowed primitive types
const StringEnumType = z.object({
  type: z.literal("string"),
  enum: z.array(z.string()),
  default: z.string()
}).strict().refine((data) => data.enum.includes(data.default), {
  message: 'Default value must be present in the enum options',
  path: ['default'],
});

const NumberEnumType = z.object({
  type: z.literal("number"),
  enum: z.array(z.number()),
  default: z.number()
}).strict().refine((data) => data.enum.includes(data.default), {
  message: 'Default value must be present in the enum options',
  path: ['default'],
});

const FieldSchema = z.union([StringType, NumberType, BooleanType, StringEnumType, NumberEnumType]);

export const QuestionParameterJsonSchema = z.record(z.string(), FieldSchema);

export type QuestionParameterJson = z.infer<typeof QuestionParameterJsonSchema>;

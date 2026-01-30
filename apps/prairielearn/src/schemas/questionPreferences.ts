import { z } from "zod";

// These types are the valid types which a preference key can be
const StringType = z.object({
  type: z.literal("string"),
  default: z.string(),
}).strict();

const NumberType = z.object({
  type: z.literal("number"),
  default: z.number(),
}).strict();

const BooleanType = z.object({
  type: z.literal("boolean"),
  default: z.boolean(),
}).strict();

// For Enums, we ensure 'default' matches the allowed primitive types
const EnumType = z.object({
  enum: z.array(z.union([z.string(), z.number()])),
  default: z.union([z.string(), z.number()]),
}).strict()
  .refine((data) => data.enum.includes(data.default), {
    message: "Default value must be present in the enum options",
    path: ["default"],
  });

const FieldSchema = z.union([StringType, NumberType, BooleanType, EnumType]);

export const QuestionParameterJsonSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), FieldSchema),
  required: z.array(z.string()).max(0).optional().default([]),
  additionalProperties: z.literal(false).optional().default(false)
}).strict();

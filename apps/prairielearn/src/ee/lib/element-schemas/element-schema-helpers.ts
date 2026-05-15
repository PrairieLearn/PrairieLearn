import * as z from 'zod/v4';

export function plBoolean() {
  return z.string().meta({ format: 'pl-boolean' });
}

export function plInteger() {
  return z.string().meta({ format: 'pl-integer' });
}

export function plFloat() {
  return z.string().meta({ format: 'pl-float' });
}

export function toDraft06JsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(zodSchema, { target: 'draft-7' });
  schema.$schema = 'http://json-schema.org/draft-06/schema#';
  return schema;
}

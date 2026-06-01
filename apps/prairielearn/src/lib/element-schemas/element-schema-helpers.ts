import * as z from 'zod/v4';

export function plBoolean() {
  return z.string().meta({ format: 'boolean-attrib' });
}

export function plInteger() {
  return z.string().meta({ format: 'integer-attrib' });
}

export function plFloat() {
  return z.string().meta({ format: 'float-attrib' });
}

/**
 * Convert a Zod schema to a JSON Schema targeting draft-06.
 *
 * We emit draft-06 because it's the newest draft that both consumers of these
 * schemas accept: the htmlmustache linter (which bundles ajv 8 — ajv 8 dropped
 * native draft-04 support, so draft-04 is not an option) and the Python
 * `jsonschema` validator. Zod has no `draft-06` target, so we generate the
 * `draft-7` shape — which is structurally compatible with draft-06 for the
 * attribute schemas we author — and stamp it as draft-06. We can't keep the
 * `draft-7` label because the htmlmustache parser doesn't implement
 * draft-07-only keywords (e.g. `if`/`then`/`else`).
 */
export function toDraft06JsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(zodSchema, { target: 'draft-7' });
  schema.$schema = 'http://json-schema.org/draft-06/schema#';
  return schema;
}

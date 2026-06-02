import * as z from 'zod/v4';

export function plBoolean() {
  return z.string().meta({ format: 'boolean' });
}

export function plInteger() {
  return z.string().meta({ format: 'integer' });
}

export function plNumber() {
  return z.string().meta({ format: 'number' });
}

/**
 * Convert a Zod schema to a JSON Schema targeting draft-04.
 *
 * draft-04 is the most broadly supported draft across both consumers of these
 * schemas: the htmlmustache linter (which, as of
 * `@prairielearn/tree-sitter-htmlmustache` 1.4.3, accepts any json-schema.org
 * dialect of draft-06 or lower) and the Python `jsonschema` validator.
 *
 * Our pinned Zod (`zod@^3.25.76 <4`, via the `zod/v4` subpath) only targets
 * `draft-7` and `draft-2020-12`, so we generate the `draft-7` shape — which is
 * structurally compatible with draft-04 for the attribute schemas we author —
 * and re-stamp `$schema` as draft-04. We can't keep the `draft-7` label because
 * the htmlmustache linter rejects draft-07 (and newer) dialects.
 */
export function toDraft04JsonSchema(zodSchema: z.ZodType): Record<string, unknown> {
  // TODO: once we're on Zod 4.x (which adds a native `draft-04` target), pass
  // `{ target: 'draft-04' }` here directly instead of re-stamping `$schema`.
  const schema: Record<string, unknown> = z.toJSONSchema(zodSchema, { target: 'draft-7' });
  schema.$schema = 'http://json-schema.org/draft-04/schema#';
  return schema;
}

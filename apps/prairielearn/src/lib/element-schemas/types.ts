import type { TagValidator } from '@reteps/tree-sitter-htmlmustache/linter';

/**
 * The schema definition for a single PrairieLearn element, discovered by
 * `scripts/gen-element-schemas.mts` from the files in `./elements`.
 *
 * Each element lives in `./elements/<tag>.ts` and exports one of these as
 * `element`. The generator uses it to emit the on-disk JSON schemas, and
 * `index.ts` / `htmlmustache-plugin.ts` assemble the linter's custom tags and
 * validators from the discovered modules.
 */
export interface ElementSchemaModule {
  /** The element's tag name, e.g. `pl-multiple-choice`. */
  tag: string;
  /** JSON Schema for the element's own attributes. */
  schema: Record<string, unknown>;
  /** JSON Schemas for permitted child tags, keyed by child tag name. */
  children?: Record<string, Record<string, unknown>>;
  /** Cross-attribute validators that can't be expressed in JSON Schema. */
  validators?: TagValidator[];
}

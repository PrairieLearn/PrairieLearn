---
name: element-validation
description: Use when changing or reviewing which attributes, child tags, values, or constraints PrairieLearn elements accept in question.html, including schemas, Python validation, docs, and legacy AI HTML validation.
---

Use this when a change affects an element's `question.html` contract: allowed attributes, required attributes, allowed values, child tags, or constraints between attributes/children.

First choose the path for the element:

- If `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts` exists, the element uses the shared schema system.
- If no schema module exists but `<tag>` is in `SUPPORTED_ELEMENTS` in `apps/prairielearn/src/ee/lib/validateHTML.ts`, AI question generation still uses legacy hand-written validation.
- If neither applies, no schema or AI-validator update is needed; still keep the element's Python behavior and docs aligned with any contract change.

Adding a schema module does not by itself expose an element to AI question generation. If AI should generate the element, `SUPPORTED_ELEMENTS` and `checkTag` in `validateHTML.ts` must also allow it.

## What must stay in sync

When a change affects an element's `question.html` contract, flag it unless the relevant surfaces stay aligned.

**Element with a schema module:**

- Update `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts` for local attributes, child schemas, enums, and value types that can be validated without inspecting parent attributes, siblings, or child contents.
- Update `apps/prairielearn/src/lib/element-schemas/elements/<tag>.validator.ts` for rules that depend on parent attributes, siblings, child contents, counts, nested structure, or other context JSON Schema cannot express.
- Run `make update-element-schemas` and include the generated JSON schemas under `apps/prairielearn/elements/<tag>/schemas/`, `apps/prairielearn/src/lib/element-schemas/registry.generated.ts`, and `.htmlmustache.jsonc`.
- Keep `apps/prairielearn/elements/<tag>/<tag>.py` aligned. Cross-attribute validators are not shared with Python; put the mirrored checks where the element already parses/validates options, and keep message wording aligned.
- Update the attribute table in `docs/elements/<tag>.md`.

**Legacy AI-validated element (in `SUPPORTED_ELEMENTS`, no schema module):**

- Update its legacy validation in `apps/prairielearn/src/ee/lib/validateHTML.ts`.
- Update the attribute table in `docs/elements/<tag>.md`.

**Other elements:**

- Update the attribute table in `docs/elements/<tag>.md`.

Do not require validation updates for unrelated controller internals, prose-only documentation edits, example updates, or validator/linter refactors that do not change the `question.html` contract.

## Shared element-schema system

Schema modules live in `apps/prairielearn/src/lib/element-schemas/elements/` and export `element: ElementSchemaModule`:

- `tag`: element tag, matching the filename.
- `schema`: JSON Schema for the element's attributes, usually from `z.toJSONSchema(z.object(...).strict(), { target: 'draft-04' })`.
- `children`: optional child-tag schemas, keyed by child tag.
- `validators`: optional `defineTagValidators(tag, { 'pl/<rule-id>': ... })` checks from `@prairielearn/tree-sitter-htmlmustache/linter`.

Use `pl-multiple-choice` as the main example when adding schema coverage for another element. Use `helpers.ts` for `booleanFormat()`, `integerFormat()`, and `numberFormat()`. Mark deprecated attributes with `.meta({ deprecated: true, description: 'Use ... instead.' })`.

Prefer schemas for stable local facts and validators for contextual facts. If child attributes depend on a parent mode, use a permissive child schema for the union of allowed attributes and enforce the mode-specific subset in a validator. Use nested `children` config for nested element structure; htmlmustache supports nested child declarations.

Generated files are checked by `make check-element-schemas`; never hand-edit them. Change the schema module and regenerate.

The JSON-schema-expressible part (allowed attributes, required attributes, enums, types) is shared through generated JSON. Cross-attribute `validators` are used by the linter and AI generation, but Python render-time code must mirror those checks manually.

When adding schema coverage for an existing element, mirror current runtime behavior unless the change is intentionally tightening or loosening the contract. If docs and runtime disagree, flag the mismatch and decide which one to change instead of silently enforcing the docs.

## Legacy AI HTML validator

For elements without a schema module, AI question generation uses `SUPPORTED_ELEMENTS` and `checkTag` in `apps/prairielearn/src/ee/lib/validateHTML.ts`. The legacy validator is independent of each element's Python implementation; it does not inspect `pl.check_attribs(...)`, `optional_attribs`, or `required_attribs`.

The element docs table is still AI prompt context: the `Attribute | Type | Default | Description` table in `docs/elements/<tag>.md` is parsed by `apps/prairielearn/src/ee/lib/context-parsers/documentation.ts`.

## Mapping contract changes

For each contract change, update the schema module or the legacy `validateHTML.ts` path:

1. **Added attribute** -> accept it.
2. **Removed attribute** -> reject it.
3. **Renamed attribute** -> accept the new name; unless intentionally breaking, keep the old name as a deprecated alias and document the new name.
4. **New required attribute** -> make it required in the schema or emit a missing-attribute error in legacy code.
5. **Changed allowed values** -> update enum/type/value validation.
6. **Changed cross-attribute constraints** -> update TypeScript validators and mirrored Python `prepare()` checks, or the legacy post-loop checks.
7. **Element added to or removed from AI support** -> update `SUPPORTED_ELEMENTS` and dispatch for legacy support, or add a schema module and regenerate.

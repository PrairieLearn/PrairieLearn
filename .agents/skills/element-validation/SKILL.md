---
name: element-validation
description: Use when changing or reviewing PrairieLearn element question.html contracts, including schema-level attributes/children, Python semantic validation, docs, and legacy AI HTML validation.
---

Use this when a change affects an element's `question.html` contract. JSON Schema is the shared lightweight contract layer; Python is authoritative for full semantic validation.

First choose the path for the element:

- If `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts` exists, the element uses the shared schema system.
- If no schema module exists but `<tag>` is in `SUPPORTED_ELEMENTS` in `apps/prairielearn/src/ee/lib/validateHTML.ts`, AI question generation still uses legacy hand-written validation.
- If neither applies, no schema or AI-validator update is needed; still keep the element's Python behavior and docs aligned with any contract change.

Adding a schema module does not by itself expose an element to AI question generation. If AI should generate the element, `SUPPORTED_ELEMENTS` and `checkTag` in `validateHTML.ts` must also allow it.

## Where to make changes

When a change affects an element's `question.html` contract, update the authoritative surface for that part of the contract.

**Element with a schema module:**

- Update `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts` for schema-level facts: allowed attribute names, required attributes, single-attribute formats/enums, deprecation metadata, and basic allowed child tag structure.
- Run `make update-element-schemas` and include the generated JSON schemas under `apps/prairielearn/elements/<tag>/schemas/`, `apps/prairielearn/src/lib/element-schemas/registry.generated.ts`, and `.htmlmustache.jsonc`.
- Update `apps/prairielearn/elements/<tag>/<tag>.py` for semantic validation, parsing, default behavior, and final user-facing validation errors.
- Update the attribute table in `docs/elements/<tag>.md`.

**Legacy AI-validated element (in `SUPPORTED_ELEMENTS`, no schema module):**

- Update its legacy validation in `apps/prairielearn/src/ee/lib/validateHTML.ts`.
- Update the attribute table in `docs/elements/<tag>.md`.

**Other elements:**

- Update `apps/prairielearn/elements/<tag>/<tag>.py` for behavior and validation changes.
- Update the attribute table in `docs/elements/<tag>.md`.

Do not require validation updates for unrelated controller internals, prose-only documentation edits, example updates, or schema/linter refactors that do not change the `question.html` contract.

## Shared element-schema system

Schema modules live in `apps/prairielearn/src/lib/element-schemas/elements/` and export `element: ElementSchemaModule`:

- `tag`: element tag, matching the filename.
- `schema`: JSON Schema for the element's attributes, usually from `z.toJSONSchema(z.object(...).strict(), { target: 'draft-04' })`.
- `children`: optional child-tag schemas, keyed by child tag.

Use `pl-multiple-choice` as the main example when adding schema coverage for another element. Use `helpers.ts` for `booleanFormat()`, `integerFormat()`, and `numberFormat()`. Mark deprecated attributes with `.meta({ deprecated: true, description: 'Use ... instead.' })`.

Prefer schemas for stable local facts and Python for semantics. Do not add TypeScript checks for semantic validation such as cross-attribute rules, mode-dependent behavior, child content/count semantics, uniqueness, ordering, or Python parsing/default behavior. If child attributes depend on a parent mode, use a permissive child schema for the union of allowed attributes and let Python enforce the mode-specific subset.

Generated files are checked by `make check-element-schemas`; never hand-edit them. Change the schema module and regenerate.

When adding schema coverage for an existing element, match current runtime behavior only for lightweight schema facts. If docs and runtime disagree, flag the mismatch and decide which one to change instead of silently enforcing the docs.

## Legacy AI HTML validator

For elements without a schema module, AI question generation uses `SUPPORTED_ELEMENTS` and `checkTag` in `apps/prairielearn/src/ee/lib/validateHTML.ts`.

The element docs table is still AI prompt context: the `Attribute | Type | Default | Description` table in `docs/elements/<tag>.md` is parsed by `apps/prairielearn/src/ee/lib/context-parsers/documentation.ts`.

## Contract Changes

- Schema-level changes belong in the schema module or legacy AI validator: added/removed/renamed attributes, required attributes, allowed values, value formats, deprecations, and basic child tag structure.
- Semantic changes belong in Python and docs: cross-attribute rules, mode-dependent behavior, child content/count semantics, uniqueness, ordering, parsing, defaults, and final error wording.
- AI support changes belong in `SUPPORTED_ELEMENTS` and legacy dispatch, or in a new schema module plus generated schema updates.

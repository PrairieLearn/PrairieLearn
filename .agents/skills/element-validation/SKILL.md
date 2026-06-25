---
name: element-validation
description: Use when changing or reviewing PrairieLearn element question.html contracts, including schema-level attributes/children, Python semantic validation, docs, and legacy AI HTML validation.
---

Use this when a change affects what course authors may write in an element's `question.html`: tag names, attributes, child tags, accepted values, or validation errors for invalid markup.

JSON Schema is the shared lightweight contract layer. Python is authoritative for semantic validation and final user-facing errors.

## Ownership

- JSON Schema owns local facts: allowed attribute names, required attributes, single-attribute formats/enums, deprecation metadata, and basic child tag structure.
- Python owns semantics: cross-attribute rules, mode-dependent behavior, child count/content rules, uniqueness, ordering, parsing, defaults, and final validation wording.
- Docs describe the author-facing contract and should match whichever layer owns the changed behavior.
- Legacy AI validation in `apps/prairielearn/src/ee/lib/validateHTML.ts` applies only to supported elements that do not yet have schema modules.

If a child attribute is only valid for some parent modes, keep the child schema permissive across the union of valid attributes and enforce the mode-specific subset in Python.

When adding Python tree validation to an existing element, preserve existing tag-name compatibility but do not expand it. If the old controller accepted legacy underscore child tags such as `pl_answer`, call `validate_element_tree(..., allow_legacy_underscore_tags=True)` and keep the parser handling those aliases. If it only accepted kebab-case tags, leave tree validation in its default strict mode.

## Workflow

1. Check for `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts`.
2. If the schema module exists, update it for schema-owned facts and run `make update-element-schemas`.
3. If no schema module exists but `<tag>` is in `SUPPORTED_ELEMENTS`, update the legacy AI validator for schema-owned facts.
4. Put semantic validation changes in `apps/prairielearn/elements/<tag>/<tag>.py`.
5. Update `docs/elements/<tag>.md` when the author-facing contract changes.

Adding a schema module does not enable AI generation for that element. If AI should generate it, also update `SUPPORTED_ELEMENTS` and `checkTag` in `validateHTML.ts`.

## Schema Modules

Schema modules live in `apps/prairielearn/src/lib/element-schemas/elements/` and export `element: ElementSchemaModule`:

- `tag`: element tag, matching the filename.
- `schema`: JSON Schema for the element's attributes, usually from `z.toJSONSchema(z.object(...).strict(), { target: 'draft-04' })`.
- `children`: optional child-tag schemas, keyed by child tag.

Use `helpers.ts` for `booleanFormat()`, `integerFormat()`, and `numberFormat()`. Mark deprecated attributes with `.meta({ deprecated: true, description: 'Use ... instead.' })`.

Generated files are checked by `make check-element-schemas`; never hand-edit them. Change the schema module and regenerate.

When adding schema coverage for an existing element, match runtime behavior for schema-owned facts. If docs and runtime disagree, identify the mismatch before deciding which surface to change.

## Tests

Test the layer that changed. For schema modules, add per-element tests only for element-specific facts that are easy to regress, such as shared child tag ownership or unusual child structure. Do not retest generic JSON Schema or linter behavior like required attributes, unknown attributes, enum validation, format validation, or deprecated-attribute warning emission for every element. Use generated schema diffs and `make check-element-schemas` to verify ordinary attribute metadata.

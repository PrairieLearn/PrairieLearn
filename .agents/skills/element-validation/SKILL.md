---
name: element-validation
description: Use when changing or reviewing PrairieLearn element question.html contracts, including schema-level attributes/children, Python semantic validation, docs, and AI HTML validation support lists.
---

Use this when a change affects what course authors may write in an element's `question.html`: tag names, attributes, child tags, accepted values, or validation errors for invalid markup.

JSON Schema is the shared lightweight contract layer. Python is authoritative for semantic validation and final user-facing errors.

## Ownership

- JSON Schema owns local facts: allowed attribute names, required attributes, single-attribute formats/enums, deprecation metadata, and basic child tag structure.
- Python owns semantics: cross-attribute rules, mode-dependent behavior, child count/content rules, uniqueness, ordering, parsing, defaults, and final validation wording.
- Docs describe the author-facing contract and should match whichever layer owns the changed behavior.
- AI HTML validation surfaces `customTagSchema` diagnostics from `lintQuestionHtml()` for schema-backed element attribute and child-tag contracts. `apps/prairielearn/src/ee/lib/validateHTML.ts` owns AI-generation support lists, unsupported-tag rejection, input-in-panel warnings, and `server.py` correct-answer bookkeeping; do not add per-element attribute validators there.
- AI element documentation context currently excludes `Migrating from deprecated attributes` and `Deprecated attributes` sections because it is used for new question generation. Put deprecated syntax there instead of in main customization tables when authors should not use it in new questions. If this context is reused to edit existing questions, make that exclusion conditional or provide separate migration context so the editor can recognize and migrate deprecated syntax.

If a child attribute is only valid for some parent modes, keep the child schema permissive across the union of valid attributes and enforce the mode-specific subset in Python.

When adding Python tree validation to an existing element, preserve existing tag-name compatibility but do not expand it. If the old controller accepted legacy underscore child tags such as `pl_answer`, call `validate_element_tree(..., allow_legacy_underscore_tags=True)` and keep the parser handling those aliases. If it only accepted kebab-case tags, leave tree validation in its default strict mode.

## Workflow

1. Check for `apps/prairielearn/src/lib/element-schemas/elements/<tag>.ts`.
2. If the schema module exists, update it for schema-owned facts and run `make update-element-schemas`.
3. If no schema module exists, prefer adding one for schema-owned facts before enabling AI generation for that element.
4. Put semantic validation changes in `apps/prairielearn/elements/<tag>/<tag>.py`.
5. Update `docs/elements/<tag>.md` when the author-facing contract changes.

Adding a schema module does not enable AI generation for that element. If AI should generate it, update the relevant support lists in `validateHTML.ts`: add renderable input elements to `INPUT_ELEMENTS`, panel-like elements to `PANEL_ELEMENTS`, schema-child-only tags to `AUXILIARY_ELEMENTS` when the unsupported-tag pass would otherwise reject them, and answer-bearing elements to the correct-answer bookkeeping sets when appropriate.

## Schema Modules

Schema modules live in `apps/prairielearn/src/lib/element-schemas/elements/` and export `element: ElementSchemaModule`:

- `tag`: element tag, matching the filename.
- `schema`: JSON Schema for the element's attributes, usually from `z.toJSONSchema(z.object(...).strict(), { target: 'draft-04' })`.
- `children`: optional child-tag schemas, keyed by child tag.

Use `helpers.ts` for `booleanFormat()`, `integerFormat()`, and `numberFormat()`. Mark deprecated attributes with `.meta({ deprecated: true, description: 'Use ... instead.' })`.

Generated files are checked by `make check-element-schemas`; never hand-edit them. Change the schema module and regenerate.

When adding schema coverage for an existing element, match runtime behavior for schema-owned facts. If docs and runtime disagree, identify the mismatch before deciding which surface to change.

AI validation only surfaces linter diagnostics whose `ruleName` is `customTagSchema`. Selector-based editor guidance and semantic Python errors are intentionally not part of AI schema validation.

## Tests

Test the layer that changed. For schema modules, add per-element tests only for element-specific facts that are easy to regress, such as shared child tag ownership or unusual child structure. Do not retest generic JSON Schema or linter behavior like required attributes, unknown attributes, enum validation, format validation, or deprecated-attribute warning emission for every element. Use generated schema diffs and `make check-element-schemas` to verify ordinary attribute metadata.

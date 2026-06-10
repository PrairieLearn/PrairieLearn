---
name: element-validation
description: How PrairieLearn validates element attributes — the shared element-schema system (linter + render-time Python) and the legacy AI HTML validator — and what must stay in sync when an element's attribute contract changes.
---

PrairieLearn validates element attributes in three places. A shared **element-schema** system now drives the first two (and feeds the third); a hand-written **legacy AI validator** still covers everything not yet migrated to a schema.

The three validation surfaces:

1. **htmlmustache linter** — runs while authoring `question.html` (editor/CLI, in-process server, and browser). Reports unknown/misvalued attributes and cross-attribute problems.
2. **Python render-time** — `pl.validate_element(...)`, called from an element's `prepare()`. Catches the same problems when a question actually renders.
3. **AI question generation** — `validateHTML.ts`, which gates LLM-generated `question.html`.

## Shared element-schema system (preferred)

Lives in `apps/prairielearn/src/lib/element-schemas/`. Source of truth is one module per element: `elements/<tag>.ts`, exporting `element: ElementSchemaModule` with:

- `tag` — the element tag, which must match the filename.
- `schema` — JSON Schema for the element's own attributes, produced from a Zod object via `z.toJSONSchema(obj, { target: 'draft-04' })`. `.strict()` makes unknown attributes an error.
- `children` — optional map of child-tag name → `ElementChildSchema` (`{ schema?, children?, allowAdditionalChildren? }`). The shape is recursive, mirroring the linter's `ChildTagConfig`, so nested children (e.g. `pl-block-group` containing `pl-answer` inside `pl-order-blocks`) can be expressed.
- `validators` — optional cross-attribute checks that JSON Schema can't express (mutual exclusion, conditional requirement, value ranges, answer-HTML uniqueness, …), defined in a sibling `elements/<tag>.validator.ts` with `defineTagValidators(tag, { 'pl/<rule-id>'(element, context) { … } })` from `@prairielearn/tree-sitter-htmlmustache/linter`.

Helpers in `element-schema-helpers.ts`: `plBoolean()`, `plInteger()`, `plNumber()` are `z.string()` tagged with a PL `format`. Mark deprecated attributes with `.meta({ deprecated: true, description: 'Use … instead.' })`.

**Generation.** After editing any `elements/*.ts` / `*.validator.ts`, run `make update-element-schemas` (runs `scripts/gen-element-schemas.mts`). From the modules it regenerates, and commits to disk:

- the JSON schemas at `apps/prairielearn/elements/<tag>/schemas/<tag>.json` (plus one per child with a schema; direct children use the bare tag name, nested children are prefixed with their ancestor tags, e.g. `pl-block-group.pl-answer.json`),
- the static module list `registry.generated.ts`,
- `.htmlmustache.jsonc` in its entirety (derived from `htmlMustacheConfig.ts` plus CLI-only settings the runtime `Config` can't express).

CI runs `make check-element-schemas` (wired into `.github/workflows/check.yml`) and fails if any generated file is stale. **Never hand-edit the generated files** — change the module and regenerate.

**The three consumers all read the same modules/schemas:**

- **Linter.** `htmlMustacheConfig.ts` is the runtime source of truth; `index.ts` assembles `elementCustomTags`, and `htmlmustache-plugin.ts` exposes `formats` + `validators`. It runs in-process via `question-html-linter.ts` (`lintQuestionHtml`), in the browser via `assets/scripts/lib/htmlMustacheLinter.ts`, and in the CLI/editor via the generated `.htmlmustache.jsonc` (`make lint-mustache`). All three must agree, which is why the `.jsonc` is generated from the TS config rather than maintained by hand.
- **Python render-time.** `pl.validate_element(element, SCHEMA_PATH, parent_tag=…)` (`prairielearn/element_schemas.py`, re-exported from `prairielearn`) loads the generated JSON schema and validates `element.attrib`. Boolean/integer/number `format`s are checked with `is_boolean_attrib` / `is_integer_attrib` / `is_float_attrib`. Its rendered messages deliberately mirror the linter's wording.
- **AI generation.** `validateHTML.ts` calls `lintQuestionHtml` and surfaces diagnostics whose `ruleName` is `customTagSchema` (attribute schema) or starts with `pl/` (the cross-attribute validators) as errors/warnings, alongside its own legacy checks.

**Sharing boundary.** The JSON-schema-expressible part (allowed attributes, enums, types) is shared end-to-end via the generated JSON. The cross-attribute `validators` are **not** automatically shared with Python — the element's `prepare()` re-implements equivalent checks by hand and must match the validator's logic **and message text**. Changing one means changing the other.

Currently only `pl-multiple-choice` (with its `pl-answer` child) has a schema module — use it as the template when migrating another element.

## Legacy AI HTML validator (`validateHTML.ts`)

For elements **without** a schema module, AI question generation still relies on the hand-written allowlist in `apps/prairielearn/src/ee/lib/validateHTML.ts`. Only tags in `SUPPORTED_ELEMENTS` (`PANEL_ELEMENTS ∪ INPUT_ELEMENTS`, near the top of the file) are exposed to AI generation; `checkTag` dispatches to per-element `check*` functions (`pl-integer-input`, `pl-number-input`, `pl-string-input`, `pl-checkbox`, `pl-symbolic-input`). This validator is **independent** of the element's Python implementation — it does not introspect `pl.check_attribs(...)`, `optional_attribs`, or `required_attribs`. `validateHTML` is `async`; any new caller must `await` it.

(`pl-multiple-choice` is in `INPUT_ELEMENTS` but `checkTag` returns no errors for it — its AI validation is fully delegated to the shared schema/validators via `lintQuestionHtml`. That is the migration end state for an element.)

The element docs table is still the AI prompt context: the `Attribute | Type | Default | Description` table in `docs/elements/<tag>.md` is parsed by `apps/prairielearn/src/ee/lib/context-parsers/documentation.ts` (which also imports `SUPPORTED_ELEMENTS`) to build the model's element reference.

## What must stay in sync

When a PR changes an element's attribute contract, flag it unless these stay in sync.

**Element with a schema module (e.g. `pl-multiple-choice`):**

- Edit `elements/<tag>.ts` / `<tag>.validator.ts`, then run `make update-element-schemas` and commit the regenerated JSON schemas, `registry.generated.ts`, and `.htmlmustache.jsonc`.
- Keep the element's Python (`apps/prairielearn/elements/<tag>/<tag>.py`) attribute set and the cross-attribute checks in `prepare()` aligned with the schema + validators, including message wording.
- Update the attribute table in `docs/elements/<tag>.md`.

**Legacy AI-validated element (in `SUPPORTED_ELEMENTS`, no schema module):**

- Update its `check*` logic in `validateHTML.ts`.
- Update the attribute table in `docs/elements/<tag>.md`.

Changes to elements **not** in `SUPPORTED_ELEMENTS` and **without** a schema module need no validator update. Don't require these for unrelated controller internals, prose-only documentation edits, example updates, or validator/linter refactors that don't change the accepted/generated HTML contract.

## Mapping a contract change to the validator

For each kind of contract change, the corresponding update in the validator (the schema module, or `validateHTML.ts` for legacy elements):

1. **Added attribute** → accept it (add to the Zod object / the `check*` switch).
2. **Removed attribute** → reject it.
3. **Renamed attribute** → accept the new name; unless intentionally breaking, keep the old name as a deprecated alias (`.meta({ deprecated: true })`). Document the new name so AI-generated content uses it.
4. **New required attribute** → make it non-`.optional()` (or emit a missing-attribute error in legacy code).
5. **Changed allowed values** (enum widened/narrowed, string → int, etc.) → update the attribute's value validation.
6. **Changed cross-attribute constraints** (X requires Y, X and Y mutually exclusive) → update the `validators` (and the mirrored check in Python `prepare()`), or the post-loop checks in the legacy `check*` function.
7. **Element added to / removed from the supported set** → for legacy, update `SUPPORTED_ELEMENTS` and `checkTag` dispatch; to migrate it to a schema, add an `elements/<tag>.ts` module and regenerate.

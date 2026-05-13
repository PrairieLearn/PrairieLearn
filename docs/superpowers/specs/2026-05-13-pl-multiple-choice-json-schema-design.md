# pl-multiple-choice JSON Schema validation

**Status:** Drafted 2026-05-13. Pilot scope.

## Problem

`apps/prairielearn/src/ee/lib/validateHTML.ts` hand-rolls per-element attribute validation for the AI question-generation agent. The `pl-multiple-choice` slice (`checkMultipleChoice` + `checkAnswerMultipleChoice`, ~150 LOC) duplicates the rules already enforced by the element's Python `prepare()`. Two places to maintain, two failure modes when they drift.

`@reteps/tree-sitter-htmlmustache` v1.0.0 adds JSON-Schema-driven `customTags[].schema` rules, evaluated by ajv with HTML/element-shaped diagnostics. v1.0.1 adds a `formats` hook on `createLinter` for consumer-registered format validators (e.g. PrairieLearn's 20-string boolean set).

We can author the schema in zod v4, convert to JSON Schema at import time, feed it to the linter, and delete the matching code in `validateHTML.ts`. The schema also drives the in-editor linter via the existing `htmlMustacheConfig`, so attribute mistakes get squiggled live in the question editor for free.

## Scope

**In:** `pl-multiple-choice` only. The schema covers everything currently in `checkMultipleChoice` and `checkAnswerMultipleChoice` — attribute presence/type/enum, cross-attribute rules (size↔display, builtin-grading=false exclusions, AOTA/NOTA narrowing, *-feedback dependencies), parent-child rules (only `pl-answer` children, `pl-answer` attribute set), and the cross-tag rule `builtin-grading=false ⇒ no score/feedback on pl-answer` (expressible via nested `if/then` over the `{ attributes, children }` envelope ajv sees).

`pl-answer` does NOT get its own `customTags` schema entry. It's a shared child element used by `pl-multiple-choice`, `pl-checkbox`, `pl-order-blocks`, `pl-block-group`, and `pl-dropdown`, each with a different attribute set. A standalone schema would force a loose union (killing the AI-error signal) or duplicate per-parent. Instead, each parent's schema owns its children's rules under `children.items` — when `pl-checkbox` is migrated in a follow-up, *that* schema encodes the checkbox-specific `pl-answer` rules. Stray `pl-answer` outside any valid parent is already caught by the existing `pl-stray-answer` custom rule in `htmlMustacheConfig`.

Python `prepare()` is untouched. The schema is purely AI-generation-facing.

**Out (follow-ups noted):**
- Other elements in `validateHTML.ts` (integer/number/string/symbolic/checkbox).
- Removing the `pl-input-in-panel` warning from `dfsCheckParseTree` (currently covered by the linter's existing `customRule`, kept for now to avoid expanding the diff).
- Using the schema for non-AI purposes (editor autocomplete, attribute docs, Python validation).
- Filing the upstream QoL ask for higher-level dependency sugar (sketched below).

## Architecture

```
zod v4 schema (TS)  →  z.toJSONSchema(...)  →  JSON Schema (Draft 2020-12)
                                                       │
                                                       ▼
                                         customTags[name].schema
                                                       │
   ┌───────────────────────────────────────────────────┴─────────────────────────────┐
   ▼                                                                                  ▼
htmlMustacheConfig.ts (browser editor)                       validateHTML.ts (Node-side, AI agent)
  linter via /linter — Ace annotations                       linter via /linter — diagnostics merged
                                                             into existing { errors, warnings } shape
```

Single artifact (`elementCustomTags`), two consumers. JSON Schema is computed at module-import time inside `element-schemas/index.ts` — no build step, no checked-in generated files.

## Packages

1. `@reteps/tree-sitter-htmlmustache`: `^0.9.3` → `^1.0.1`. Entry-point migration `/browser` → `/linter` for lint, `/formatter` for format. `createLinter().format(...)` becomes `createFormatter().format(...)`. `createLinter` gains a `formats` option.
2. `zod`: no version bump. Current pin `^3.25.76 <4` already exposes `zod/v4` on the 3.25 minor line. New files use `import * as z from 'zod/v4'`; existing `import { z } from 'zod'` callers stay on v3.

## File layout

**New:**

```
apps/prairielearn/src/ee/lib/element-schemas/
├── index.ts                  — converts zod → JSON Schema, exports elementCustomTags
├── formats.ts                — pl-boolean / pl-integer / pl-float format predicates
├── pl-multiple-choice.ts     — zod schemas (parent + child envelopes)
└── pl-multiple-choice.test.ts

apps/prairielearn/src/ee/lib/htmlMustacheLinterNode.ts
                              — server-side singleton linter, locateWasm via createRequire
```

**TODO comment added:**

- `apps/prairielearn/elements/pl-multiple-choice/pl-multiple-choice.py` — header comment pointing at `apps/prairielearn/src/ee/lib/element-schemas/pl-multiple-choice.ts`: any change to attribute validation here must be mirrored in the schema until the Python side is unified onto the schema (planned follow-up, see "Out of scope").

**Moved (required — the two TS projects don't cross):**

- `apps/prairielearn/assets/scripts/lib/htmlMustacheConfig.ts` → `apps/prairielearn/src/lib/htmlMustacheConfig.ts`. `src/tsconfig.json` has `rootDir: "./"`, so server-side code can't reach files under `assets/scripts/`. Moving the config to `src/lib/` lets both consumers import it: the browser linter (which already imports `src/`-side code, e.g. tRPC types) keeps working, and `element-schemas/index.ts` can now build the merged config in one place. The file body is pure data with no DOM deps, so the move is mechanical.

**Modified:**

- `apps/prairielearn/src/lib/htmlMustacheConfig.ts` (post-move) — replace the bare `{ name: 'pl-multiple-choice' }` entry with the schema-bearing version from `element-schemas`. The bare `{ name: 'pl-answer' }` entry stays as-is (no standalone schema — see Scope). Switch the `Config` type import from `@reteps/tree-sitter-htmlmustache/browser` to `@reteps/tree-sitter-htmlmustache/linter`.
- `apps/prairielearn/assets/scripts/lib/htmlMustacheLinter.ts` — import `/linter` for `createLinter`, `/formatter` for `createFormatter`. Two singletons. Pass `formats: plFormats` to `createLinter`. Update the `htmlMustacheConfig` import to the new path.
- `apps/prairielearn/src/ee/lib/validateHTML.ts` — make `validateHTML` async; call `lintQuestionHtml`; merge diagnostics into `errors`/`warnings`; delete `checkMultipleChoice`, `checkAnswerMultipleChoice`, and the `pl-multiple-choice` / `pl-answer` cases in `checkTag`.
- Callers of `validateHTML`: `apps/prairielearn/src/ee/lib/ai-question-generation/agent.ts:467` and `apps/prairielearn/src/ee/lib/context-parsers/template-questions.ts:26` — add `await` (both call sites are already inside async functions).

**Deleted in this PR:**

- `checkMultipleChoice` (`validateHTML.ts`)
- `checkAnswerMultipleChoice` (`validateHTML.ts`)
- `BOOLEAN_VALUES`, `BOOLEAN_TRUE_VALUES`, `BOOLEAN_FALSE_VALUES` constants in `validateHTML.ts` — consolidated into `element-schemas/formats.ts`.

## Zod authoring

The zod schema models the whole envelope ajv sees: `{ attributes, children: [{ tag, attributes }, ...] }`. Cross-attribute and cross-tag rules ride either as `z.discriminatedUnion` (emits `oneOf` with `const`) or via `z.toJSONSchema({ override })` to inject `if/then`. We pick per-rule based on diff readability.

Format-aware attribute primitives use zod's `.meta({ jsonSchema: { format: 'pl-boolean' } })` so the emitted JSON Schema carries the format name; ajv then dispatches to the predicate registered in `createLinter({ formats })`.

The linter's mustache-waiver (sentinel + instancePath post-filter, per the upstream grill ADR) bypasses format checks for values containing `{{…}}` — we don't fold mustache acceptance into each predicate.

Custom error messages are sparing. Defaults like "Unknown attribute `foo` on `<pl-multiple-choice>`" are already HTML-shaped. We override only:

- The `builtin-grading=false` discriminator failures — default "must match exactly one schema in `oneOf`" is opaque. Override with a concrete sentence per branch.
- `size`/`placeholder` requiring `display="dropdown"` — default `if/then` failure is generic. Override with the same wording `prepare()` produces.

## Wiring

```ts
// apps/prairielearn/src/ee/lib/htmlMustacheLinterNode.ts
import { createLinter, type Linter, type Diagnostic } from '@reteps/tree-sitter-htmlmustache/linter';
import { htmlMustacheConfig } from '../../lib/htmlMustacheConfig.js';
import { plFormats } from './element-schemas/formats.js';

let linterPromise: Promise<Linter> | null = null;
function getLinter() {
  if (!linterPromise) {
    linterPromise = createLinter({
      locateWasm: (name) => { /* createRequire-based resolution */ },
      formats: plFormats,
    });
  }
  return linterPromise;
}

export async function lintQuestionHtml(file: string): Promise<Diagnostic[]> {
  const linter = await getLinter();
  return linter.lint(file, htmlMustacheConfig);
}
```

```ts
// apps/prairielearn/src/ee/lib/validateHTML.ts (excerpt)
export async function validateHTML(file: string, hasServerPy: boolean): Promise<HTMLValidationResult> {
  // ...existing preamble checks (doctype/html/body/head)...
  const tree = parse5.parseFragment(file);
  const { errors, warnings, mandatoryPythonCorrectAnswers } = dfsCheckParseTree(tree);

  const diagnostics = await lintQuestionHtml(file);
  for (const d of diagnostics) {
    (d.severity === 'error' ? errors : warnings).push(d.message);
  }
  // ...existing mustache template / server.py checks...
  return { errors, warnings };
}
```

## Schema coverage from upstream features now available

Upstream `@reteps/tree-sitter-htmlmustache` ships:

- Custom `format` registration on `createLinter` (v1.0.1) — used for `pl-boolean`/`pl-integer`/`pl-float` predicates so individual attributes don't re-enumerate the 20 boolean strings.
- `text`/`innerHtml` projections in the per-child envelope — gives ajv access to inner content for `pl-answer` children. Available but only directly used by the duplicate-text rule below; future element migrations can use them for length / emptiness / pattern rules.
- Path-aware uniqueness keyword (ajv-keywords' `uniqueItemProperties` or equivalent) — enables the duplicate-`pl-answer` rule below.

**Pilot rules now in the schema:**

- All `checkMultipleChoice` attribute/cross-attribute/parent-child rules (already planned).
- `minItems: 1` on `children` matching `pl-answer`.
- `pl-answer` `score` in `[0.0, 1.0]` via `minimum` + `maximum` on the `pl-float`-typed property.
- **Duplicate `pl-answer` inner-text detection** (`pl-multiple-choice.py:499-508`) — via the path-aware uniqueness keyword over the children's `text` field.

## Rules carved out of the schema (left in `prepare()`)

These don't cleanly express in JSON Schema 2020-12 + the currently-shipped upstream vocabulary:

- **Cardinality conditional on attribute value** (`pl-multiple-choice.py:240-254`). "At least 1 correct `pl-answer` when builtin-grading + NOTA-is-not-correct." Expressible via `contains` + enumerated 20-string truthy `enum`, but the result is grotesque. Deferred until upstream lands a truthy-aware `contains` (or `createLinter({ keywords })` so we write a `pl-truthy-contains` keyword ourselves).
- **Attribute-value-vs-child-count** (`pl-multiple-choice.py:291-302`). "`number-answers` ≤ count of children-filtered-by-attribute." Needs a custom keyword that compares an attribute-as-integer to a derived array length.
- **Cross-element `answers-name` uniqueness** (`pl-multiple-choice.py:453-456`). Document-scope, not tag-scope; outside the schema model entirely. Not in `checkMultipleChoice` either — same gap, unchanged by this pilot.
- **`external-json` file existence**. Filesystem access; out of schema's reach.

Folded back in once upstream lands custom keywords (for the first two) and walkers (for the last two).

## Mustache waiver

We inherit the linter's upstream mustache waiver as-is: when an operand of a cross-attribute rule is mustache-bearing (e.g. `display="{{format}}"`), the rule is suppressed. This allows the LLM to "escape" cross-attribute constraints by mustache-ifying one side, but the runtime check in Python's `prepare()` (which runs after Mustache rendering) catches cases where the resolved value violates the constraint. We do not add a TS-side check for "every mustache name is bound by server.py" — same drift-acceptance policy as the schema/`prepare()` relationship.

## Failure modes

- **Linter WASM init fails server-side.** `lintQuestionHtml` propagates the error; AI generation request fails loudly. The agent's existing error path handles request failures. Browser side keeps the current swallow-and-log behavior.
- **Schema drift between zod and runtime.** Impossible by construction: JSON Schema is computed at import time, single artifact.
- **Diagnostic phrasing drift in the AI prompt.** A few `validateHTML.test.ts` assertions for `pl-multiple-choice` will need updating to match linter wording. New `pl-multiple-choice.test.ts` is the canonical assertion site going forward.

## Tests

- **New:** `apps/prairielearn/src/ee/lib/element-schemas/pl-multiple-choice.test.ts`. Table-driven, one row per rule formerly enforced by `checkMultipleChoice`. Each row: input HTML fragment → expected diagnostic message + severity. Run the linter directly (Node side) so the test doesn't need a browser context.
- **Modified:** `apps/prairielearn/src/ee/lib/validateHTML.test.ts`. Remove `pl-multiple-choice` rows (covered above). Existing rows for other elements stay.
- **Unchanged:** AI question-generation tests (`agent.ts` contract is preserved).

## Risks accepted

- `pl-input-in-panel` double coverage (linter customRule + `dfsCheckParseTree` warning) until a follow-up PR. Worst case: duplicate warning. Not a correctness issue.
- v1.0.1 custom-formats API timing. If implementation starts before the public release, fallback is inline enum strings for booleans — verbose but functional.

## Out of scope (follow-ups)

- Migrate remaining elements (integer/number/string/symbolic/checkbox) — repeats this pattern, each isolated.
- Retire the `pl-input-in-panel` `dfsCheckParseTree` warning once linter coverage is verified in production.
- Surface attribute completions and docs from the same schemas in the editor.
- Feed JSON Schema to Python `prepare()` for a single source of truth across runtime + AI paths. **Planned** (not just possible) — the TODO in `pl-multiple-choice.py` will be retired by this work.
- Upstream QoL ask: a higher-level dependency sugar (`requires: [{ when, then }]`) over `if/then`. Optional; JSON Schema works.

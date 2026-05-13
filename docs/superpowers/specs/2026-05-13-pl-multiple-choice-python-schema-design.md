# pl-multiple-choice Python schema validation

**Status:** Drafted 2026-05-13. Depends on [2026-05-13-pl-multiple-choice-json-schema-design.md](2026-05-13-pl-multiple-choice-json-schema-design.md) — the TS-side pilot must land first.

## Problem

The TS pilot makes the zod-authored JSON Schema the single source of truth for `pl-multiple-choice` attribute and structural rules on the AI-generation path. The matching validation in Python's `prepare()` — `pl.check_attribs`, the cross-attribute rules for `builtin-grading=false`, the `size`/`placeholder` vs `display=dropdown` check, the score-range check, the duplicate-text Counter — stays. Two implementations, two failure modes when they drift. The TS pilot's header TODO in `pl-multiple-choice.py` makes the duplication explicit and load-bearing.

Python should consume the same schema artifact, run jsonschema-based validation at the top of `prepare()`, and delete the matching code paths. The schema stays single-sourced from zod; primitives (formats, consumer keywords) get parallel Python implementations with a name-parity check in CI.

## Scope

**In:** `pl-multiple-choice` only. Mirrors the TS pilot's one-element scope. Other elements migrate in lockstep with their TS-side migrations as follow-ups.

The Python harness (validator, format checker, keyword registry, error mapper, envelope construction) is element-agnostic and lives in the `prairielearn` library so future element migrations are zero-infrastructure.

**Out (follow-ups noted):**

- Other elements in `validateHTML.ts` once their TS-side migrations land.
- Adding the `pl-truthy-contains` and `attribute-le-child-count` consumer keywords to absorb `prepare_answers_to_display`'s conditional cardinality checks.
- Cross-language end-to-end parity test (the parity manifest covers presence drift; per-language tests cover wording).
- Source-line attribution on `validate_element` errors using `lxml`'s `sourceline`.

## Architecture

```
zod v4 schema (TS, from pilot)
        │
        ▼
z.toJSONSchema(...) at TS import time
        │
        ├──→ TS-side runtime (linter, AI agent)                       ── unchanged
        │
        └──→ generate.ts (new): writes
              apps/prairielearn/elements/pl-multiple-choice/pl-multiple-choice.schema.json
              apps/prairielearn/src/ee/lib/element-schemas/keywords.manifest.json
                       │
                       ▼
                 pl-multiple-choice.py:
                 ├─ pl.validate_element(element, SCHEMA_PATH)
                 │   ├─ builds {attributes, children:[{tag, attributes, text}]}
                 │   ├─ normalizes underscore → dash on attribs & tags
                 │   ├─ runs PLValidator with pl_format_checker
                 │   └─ raises ValueError using schema's errorMessage
                 └─ keeps: cross-element name check, external-json file existence,
                           sampling-time invariants in prepare_answers_to_display
```

TS is the source of truth for both schema content and the keyword/format manifest. Python authors no element-specific _rules_ — each element's `.py` file gains only a `SCHEMA_PATH` constant and a `validate_element` call at the top of `prepare()`.

## Packages

- `jsonschema`: new Python dep. Currently only `jsonschema2md` (a different package) is present. Pinned to a recent version; well-maintained, broad use.

No TS-side package changes beyond the pilot.

## File layout

**New:**

```
apps/prairielearn/python/prairielearn/element_schemas.py
  — PLValidator + pl_format_checker + PL_KEYWORDS + validate_element()
apps/prairielearn/python/prairielearn/test/test_element_schemas.py
  — harness tests (envelope build, error mapping, parity check)

apps/prairielearn/elements/pl-multiple-choice/pl-multiple-choice.schema.json
  — generated, checked in
apps/prairielearn/src/ee/lib/element-schemas/keywords.manifest.json
  — generated, checked in: {"keywords": [...], "formats": [...]}

scripts/gen-element-schemas.mts
  — generator: imports the TS pilot's serializer, writes per-element
    schema files + keywords manifest. Matches the existing
    scripts/gen-jsonschema.mts pattern; run via tsx from the Makefile.
```

**Modified (Python):**

- `apps/prairielearn/python/prairielearn/html_utils.py`:
  - Extract `_PL_BOOLEAN_TRUE` / `_PL_BOOLEAN_FALSE` frozensets, `is_pl_boolean` / `parse_pl_boolean`, `is_pl_integer` / `parse_pl_integer`, `is_pl_float` / `parse_pl_float` to module level.
  - `get_boolean_attrib`/`get_integer_attrib`/`get_float_attrib` call the parsers.
  - The inline `true_values`/`false_values` lists are removed.
- `apps/prairielearn/python/prairielearn/__init__.py`: export `validate_element`.
- `apps/prairielearn/elements/pl-multiple-choice/pl-multiple-choice.py`:
  - Add `SCHEMA_PATH = pathlib.Path(__file__).with_suffix(".schema.json")` at module top.
  - Call `pl.validate_element(element, SCHEMA_PATH)` at the top of `prepare()`.
  - Delete the TS-pilot-added TODO header comment.
  - Delete validations covered by the schema (enumerated in "Removed from prepare()" below).
- `apps/prairielearn/elements/pl-multiple-choice/pl-multiple-choice.test.py`: reword assertions for messages that change from interpolated `ValueError` strings to static `errorMessage` strings. Add rows for schema-tightened rules.

**Modified (TS):**

- `apps/prairielearn/src/ee/lib/element-schemas/index.ts`: expose a serializer function (`serializeElementSchemas()` returning `{ schemas: Record<elementName, JsonSchema>, keywords: string[], formats: string[] }`) that both the in-process linter/AI-agent consumers and the generator script call. The existing TS pilot already computes the schemas at import time; this just makes the artifact addressable.
- `Makefile`: new `update-element-schemas` target, body:

  ```make
  update-element-schemas:
  	@yarn dlx tsx scripts/gen-element-schemas.mts && \
  	  yarn prettier --write "apps/prairielearn/elements/**/*.schema.json" \
  	                       "apps/prairielearn/src/ee/lib/element-schemas/keywords.manifest.json"
  ```

- CI config: freshness check on the generated schema files and manifest, same shape as `update-jsonschema`.

## Validation entry point

```python
# in pl-multiple-choice.py
SCHEMA_PATH = pathlib.Path(__file__).with_suffix(".schema.json")

def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element(element, SCHEMA_PATH)
    # ... cross-element checks, then categorize / sample
```

```python
# in element_schemas.py
@functools.cache
def _load_schema(path: pathlib.Path) -> dict:
    return json.loads(path.read_text())

def validate_element(element: lxml.html.HtmlElement, schema_path: pathlib.Path) -> None:
    schema = _load_schema(schema_path)
    _assert_registered_names(schema)  # see "Pre-flight" below
    envelope = _build_envelope(element)
    validator = PLValidator(schema, format_checker=pl_format_checker)
    first = next(validator.iter_errors(envelope), None)
    if first is not None:
        raise ValueError(_render_error(first))
```

`@functools.cache` keeps schema parsing one-time per element across the zygote's lifetime. Fail-fast on first error matches existing `prepare()` semantics.

## Envelope construction

```python
def _build_envelope(element):
    return {
        "attributes": _normalize_attrs(element.attrib),
        "children": [
            {
                "tag": child.tag.replace("_", "-"),
                "attributes": _normalize_attrs(child.attrib),
                "text": child.text_content(),
            }
            for child in element
            if not isinstance(child, lxml.etree._Comment)
        ],
    }

def _normalize_attrs(attribs):
    return {k.replace("_", "-"): v for k, v in attribs.items()}
```

Underscore-form names (`pl_answer`, `none_of_the_above`) get normalized to dash-form before validation. The schema only ever sees dash-form. (The TS-side linter may or may not normalize the same way today — out of scope for this spec; if the TS-side accepts source-HTML underscore forms as "unknown attribute" errors, that's a TS-pilot question, not a Python-consumer question, since the Python envelope is constructed from already-parsed lxml.)

**Note on `text` semantics (intentional tightening):** the envelope's `text` field uses `lxml`'s `.text_content()` — visible text only, stripping inner HTML markup. This matches the TS linter's `text` projection (per the TS pilot's `unique-child-text` example) and tightens Python's existing duplicate detection, which used `pl.inner_html(child)` and therefore treated `<b>A</b>` and `A` as distinct. Under the new behavior they're duplicates — which is the correct rule from the student's perspective. Any course content that intentionally relied on markup-distinguished duplicates will surface as a `ValueError` after this lands; that's a course-content bug worth surfacing.

## Format & keyword registries

```python
# element_schemas.py
from prairielearn.html_utils import is_pl_boolean, is_pl_integer, is_pl_float

pl_format_checker = FormatChecker()
pl_format_checker.checks("pl-boolean")(is_pl_boolean)
pl_format_checker.checks("pl-integer")(is_pl_integer)
pl_format_checker.checks("pl-float")(is_pl_float)

def _unique_child_text(validator, value, instance, schema):
    if value is not True:
        return
    seen = set()
    for child in instance.get("children", []):
        t = child.get("text", "").strip()
        if t in seen:
            yield ValidationError(f"Duplicate child text: {t!r}")
        seen.add(t)

PL_KEYWORDS = {"unique-child-text": _unique_child_text}
PLValidator = extend(Draft202012Validator, validators=PL_KEYWORDS)
```

Both registries are introspectable via `set(PL_KEYWORDS)` and `set(pl_format_checker.checkers)`.

## Format predicate extraction (the `html_utils.py` change)

The current `get_boolean_attrib` (lines 217–265) defines `true_values` / `false_values` as local lists inside the function. They lift to module-level frozensets, with paired predicate / parser:

```python
_PL_BOOLEAN_TRUE  = frozenset({"true","t","1","True","T","TRUE","yes","y","Yes","Y","YES"})
_PL_BOOLEAN_FALSE = frozenset({"false","f","0","False","F","FALSE","no","n","No","N","NO"})

def is_pl_boolean(value: str) -> bool:
    return value in _PL_BOOLEAN_TRUE or value in _PL_BOOLEAN_FALSE

def parse_pl_boolean(value: str) -> bool:
    if value in _PL_BOOLEAN_TRUE:  return True
    if value in _PL_BOOLEAN_FALSE: return False
    raise ValueError(f"Attribute must be a boolean value: {value}")
```

`get_boolean_attrib` collapses to `return parse_pl_boolean(val)` (plus its existing default-handling preamble). Same shape for `is_pl_integer`/`parse_pl_integer` (wraps `int()`) and `is_pl_float`/`parse_pl_float` (wraps `float()`). One acceptance set in Python; both the legacy parsing helpers and the new format checker call it.

## Parity manifest

TS generator emits `apps/prairielearn/src/ee/lib/element-schemas/keywords.manifest.json`:

```json
{
  "keywords": ["unique-child-text"],
  "formats": ["pl-boolean", "pl-integer", "pl-float"]
}
```

One manifest, not per-element — the registries are global. The manifest is a **registry snapshot**: it lists names _registered_ on the TS side (`Object.keys(plKeywords)`, format names in `plFormats`), not names _referenced_ by any element schema. Reference-side issues (a schema that uses an unregistered keyword) are caught at validation time by `_assert_registered_names`; two-layer defense without trying to compute a union-of-references at generator time.

Python parity test:

```python
def test_keyword_format_parity():
    manifest = json.loads(MANIFEST_PATH.read_text())
    assert set(manifest["keywords"]) == set(PL_KEYWORDS)
    assert set(manifest["formats"]) == set(pl_format_checker.checkers)
```

Catches **presence drift only**. Semantic drift (same name, different behavior) is on the per-element test rows.

## Pre-flight registry check

`_assert_registered_names(schema)` walks the loaded schema once and asserts every `format` and consumer-keyword name referenced is registered in `PL_KEYWORDS` / `pl_format_checker.checkers`. Cheap and runs once per schema load (cached).

Without this, jsonschema silently _skips_ unknown format/keyword names — required behavior per Draft 2020-12 § 4.3.1, which mandates implementations ignore unknown keywords so schemas remain portable across vocabularies. A typo (`pl-bolean` for `pl-boolean`) would pass validation trivially. The CI parity test catches naming drift between TS and Python registries, but a typo present in _both_ registries would slip through; the pre-flight walker catches the typo locally at first `validate_element` call.

**Walker shape**: explicit recursion over subschema-position keywords (`properties`, `patternProperties`, `additionalProperties`, `propertyNames`, `items`, `prefixItems`, `contains`, `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else`, `dependentSchemas`, `$defs` / `definitions`). At each node, collect any `format` value and any object-key matching `PL_KEYWORDS`. Assert each collected name is in the registered set, with a clear error naming the offender and the schema path.

The implementation plan must include a unit test that runs the walker over a hand-crafted nested schema and verifies it finds names buried in each subschema-position keyword. ~20 LOC of walker plus ~30 LOC of test.

## Error mapping

```python
def _render_error(error: ValidationError) -> str:
    em = error.schema.get("errorMessage") if isinstance(error.schema, dict) else None
    if isinstance(em, str):
        return em
    if isinstance(em, dict):
        return em.get(error.validator) or em.get("_") or error.message
    return error.message
```

Handles the two `errorMessage` shapes ajv-errors uses in the TS pilot (string override at the subschema, object form keyed by failing rule name), falling back to jsonschema's default phrasing.

**Interpolation**: ajv-errors does not support interpolation, so the TS pilot's `errorMessage` strings are static — no `{name}` substitution. Python adopts the same. Consequence: the handful of `prepare()` errors that interpolate `name` (e.g. `f'"size" attribute on "{name}" should only be set...'`) lose the interpolation when migrated. A few assertions in `pl-multiple-choice.test.py` get rewritten to static wording. The PrairieLearn render layer already shows the failing element's name above the raised error, so the UX regression is small.

## Removed from `prepare()`

All paths the schema now covers:

| Removed                                                                                                                 | Where                          | Replaced by                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `pl.check_attribs(...)` for `pl-multiple-choice`                                                                        | `prepare:439`                  | Schema attribute set + `additionalProperties: false`                   |
| `size`/`placeholder` requires `display=dropdown`                                                                        | `prepare:443-451`              | Schema `if/then`                                                       |
| `builtin-grading=false` exclusions for `weight`, `hide-score-badge`, restricted aota/nota, per-child `score`/`feedback` | `prepare:462-491`              | Schema `if/then` over the envelope                                     |
| `pl.check_attribs(child, ...)` for `pl-answer`                                                                          | `categorize_options:77-81`     | Schema `children.items.properties` + `additionalProperties: false`     |
| Score range `[0.0, 1.0]`                                                                                                | `categorize_options:88-93`     | Schema `minimum`/`maximum` on `pl-float`-typed property                |
| Duplicate-text Counter                                                                                                  | `prepare:499-508`              | Schema `unique-child-text` keyword over `.text_content()`-based `text` |
| TS-pilot-added header TODO comment                                                                                      | top of `pl-multiple-choice.py` | n/a                                                                    |

## Kept in `prepare()`

Not schema-shaped:

| Kept                                                   | Where                                | Why                                                                    |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------- |
| `answers-name` uniqueness across elements              | `prepare:453-456`                    | Document-scope; schema sees one tag at a time                          |
| `external-json` file existence + parse                 | `categorize_options:113-130`         | Filesystem                                                             |
| `aota=CORRECT and nota=CORRECT` conflict               | `prepare_answers_to_display:235-238` | Sampling-time invariant after defaulting                               |
| `aota in {CORRECT,RANDOM} and len_correct < 2`         | `prepare_answers_to_display:240-244` | Conditional cardinality (needs `pl-truthy-contains` keyword; deferred) |
| `builtin-grading + nota not correct + len_correct < 1` | `prepare_answers_to_display:246-254` | Same                                                                   |
| `number-answers` cannot be satisfied                   | `prepare_answers_to_display:291-302` | Same                                                                   |
| Internal sampling sanity check                         | `prepare_answers_to_display:341-344` | Computed during sampling                                               |

## Mustache waiver

Doesn't apply on the Python side. `prepare()` runs _after_ mustache rendering, so the schema validates resolved attribute values. Cleaner than the TS path; no waiver, no instancePath post-filter.

## Tests

- **`test_element_schemas.py`** (new — harness only): envelope construction (including underscore normalization), error mapping (three `errorMessage` shapes), pre-flight registry check (unregistered format/keyword raises clearly), parity test against `keywords.manifest.json`. Does not import any element's schema; pure harness coverage.
- **`pl-multiple-choice.test.py`** (modified). Two categories of update:
  - **Moved coverage, reworded message**: every rule in the §Removed-from-prepare table whose existing test row asserts on a Python `ValueError` string. Reword to the schema's `errorMessage`, and update the row's expected failure point (the assertion now fires at `validate_element` rather than inside `prepare_answers_to_display` / `categorize_options` / etc.). Includes `minItems: 1` (was at `prepare_answers_to_display:222-225`) and score range `[0.0, 1.0]` (was at `categorize_options:88-93`) — these are _not_ new rules for Python; they used to fire deeper in the call stack and now fire at the schema check.
  - **Genuinely tightened coverage**: duplicate-text. Was `pl.inner_html(child)`-based; is now `.text_content()`-based, so a new row covers markup-distinguished visual duplicates (`<b>A</b>` vs `A`) now flagging as duplicates.
  - Rows for rules that stay in `prepare()` (cross-element name uniqueness, sampling-time invariants like the AOTA/NOTA conflicts and `number-answers`-cannot-be-satisfied) are unchanged.
- **`pl-multiple-choice.test.ts`** (modified — TS pilot's test): unchanged. Same schema, same assertions. Confirms the generator's serialized output behaves identically to in-memory zod compilation.

## Failure modes

- **`jsonschema` import fails / dep not installed.** Python zygote startup fails loudly; same severity as any other missing dep.
- **Schema file missing or malformed JSON.** `validate_element` raises at first call. CI freshness check catches missing files; malformed JSON would mean a broken generator and would never pass review.
- **Format / keyword name referenced but not registered.** Pre-flight check raises with a clear message naming the offender.
- **Schema and Python registry drift.** Parity test fails in CI.
- **Diagnostic wording drift.** A few `pl-multiple-choice.test.py` rows fail; canonical wording lives in the zod `errorMessage` overrides.

## Risks accepted

- **Semantic drift in consumer keywords** between TS and Python implementations. Parity manifest catches name drift, not behavior drift. Mitigation: keyword set is tiny (one entry at pilot start); per-element tests catch most rule-level regressions.
- **Wording loss: `{name}` interpolation drops** from a handful of `prepare()` errors. Documented; tests get updated.
- **`jsonschema` becomes a hard dep on the question-rendering hot path.** Well-maintained, broadly used; small addition.
- **Generator + manifest add ritual.** Editing zod requires `make update-element-schemas` before commit. CI freshness check catches forgetting. Same shape as the existing `update-jsonschema` workflow.

## Out of scope (follow-ups)

- Migrate remaining elements (integer / number / string / symbolic / checkbox) — each a self-contained PR mirroring this one, no new harness work; done in lockstep with TS-side migrations.
- `pl-truthy-contains` and `attribute-le-child-count` consumer keywords; absorb the matching `prepare_answers_to_display` checks into the schema.
- Cross-language E2E parity test.
- Source-line attribution on `validate_element` errors via lxml's `sourceline`.
- Surface the same schema to the question editor for Python-side autocomplete and docs.

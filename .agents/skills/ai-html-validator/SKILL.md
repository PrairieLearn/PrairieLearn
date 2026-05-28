---
name: ai-html-validator
description: Keeping the AI question generation HTML validator in sync with element implementations.
---

The AI question generation feature validates LLM output against a hand-written allowlist of elements and attributes at `apps/prairielearn/src/ee/lib/validateHTML.ts`. The validator is **independent** of each element's Python implementation; it does not introspect `pl.check_attribs(...)`, `optional_attribs`, or `required_attribs`. Only elements in `SUPPORTED_ELEMENTS` (top of `validateHTML.ts`) are exposed to AI generation — changes to other elements need no validator update.

## Review checklist

When a PR changes the generated HTML contract for an element in `SUPPORTED_ELEMENTS`, flag it unless these stay in sync:

- `apps/prairielearn/elements/<element>/<element>.py` (and/or `info.json`) — the element's source-of-truth attribute set.
- `apps/prairielearn/src/ee/lib/validateHTML.ts` — the element's validation logic.
- `docs/elements/<element>.md` — the `Attribute | Type | Default | Description` table, which `apps/prairielearn/src/ee/lib/context-parsers/documentation.ts` parses to build the AI prompt context.

Do not require all three for unrelated controller internals, prose-only documentation edits, example updates, or validator refactors that do not change the accepted/generated HTML contract.

## Mapping element changes to validator updates

For each kind of contract change in the element's Python file, the corresponding update in `validateHTML.ts`:

1. **Added attribute** → accept it.
2. **Removed attribute** → reject it.
3. **Renamed attribute** → accept the new name; unless intentionally breaking compatibility, keep accepting the old name as a deprecated alias. Document the new name so AI-generated content uses it.
4. **New required attribute** → emit a missing-attribute error.
5. **Changed allowed values** (enum widened/narrowed, type changed from string to int, etc.) → update the attribute value validation.
6. **Changed cross-attribute constraints** (e.g. attribute X requires attribute Y) → update the constraint checks.
7. **Element added to or removed from the supported set** → update the supported-element lists, tag dispatch, and any nesting rules.

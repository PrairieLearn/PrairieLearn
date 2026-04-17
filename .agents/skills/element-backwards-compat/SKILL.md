---
name: element-backwards-compat
description: Backwards compatibility rules when changing element controllers in `apps/prairielearn/elements/`.
---

Several fields on the `data` dict that an element controller receives are persisted to the database and read back by future invocations — potentially years later, across many PrairieLearn upgrades. **Existing variants and submissions are not re-generated when element code changes.**

The persisted dict-shaped fields are:

- On the variant row: `data["params"]`, `data["correct_answers"]`.
- On submission rows: `data["submitted_answers"]`, `data["raw_submitted_answers"]`, `data["partial_scores"]`, `data["feedback"]`, `data["format_errors"]`.

(`data["score"]` and `data["variant_seed"]` are also persisted, but they are scalars — there are no keys to add or remove, so this rule doesn't apply to them.)

Any new key added to one of the dicts above (or to a nested dict stored inside one) will be missing on rows written before the change. Reading it with `dict[key]` throws `KeyError` and breaks every existing question that uses the element. This has happened multiple times in `pl-order-blocks` alone (`ordering_feedback`, `distractor_feedback`, `initially_placed`).

## Rules

When changing an element controller in `apps/prairielearn/elements/`, treat reads of persisted data as untrusted:

1. **Adding a new key to a persisted dict?** Every reader in every element function must use `dict.get(key, default)` with a sensible default, never `dict[key]`. This applies to:
   - Top-level keys in any persisted field listed above.
   - Keys inside any nested per-block / per-answer dict written by `prepare` (e.g. each entry of `data["params"][answer_name]`) or by `parse`/`grade` into submission fields.
   - The corresponding `TypedDict` field should be marked `NotRequired[...]` from `typing_extensions` so pyright catches unguarded reads.

2. **Renaming or removing a persisted key?** Don't. Keep the old key alongside the new one and have readers fall back to the old key when the new one is missing.

3. **Changing the type or semantics of an existing key?** Same as renaming — old rows still hold the old shape. Add a new key with the new semantics rather than mutating the meaning of an existing one.

## Reviewing element changes

When reviewing a diff that touches an element controller, look for:

- New entries in any `TypedDict` describing persisted data — then grep the file for `dict["new_key"]` style reads and flag any that aren't `.get(...)`.
- New assignments into any of the persisted `data[...]` fields listed above (or into nested dicts stored inside them) — same check on the read sites.
- New required fields on Pydantic models or dataclasses that get serialized into persisted data.

If you find an unguarded read of a newly-added key, the fix is almost always to switch to `.get(key, default)` and choose a default that matches the pre-change behavior.

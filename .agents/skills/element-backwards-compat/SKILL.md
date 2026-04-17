---
name: element-backwards-compat
description: Backwards compatibility rules when changing element controllers in `apps/prairielearn/elements/`.
---

Several dict-shaped fields on the `data` dict that an element controller receives are persisted to the database and read back by future invocations. **Existing variants and submissions are not re-generated when element code changes**, so any new key added to a persisted dict will be missing on rows written before the change. Reading it with `dict[key]` throws `KeyError` and breaks every existing question that uses the element. This has happened twice in `pl-order-blocks` alone (`ordering_feedback`, `initially_placed`).

The persisted dict-shaped fields are:

- On the variant row: `data["params"]`, `data["correct_answers"]`.
- On submission rows: `data["submitted_answers"]`, `data["raw_submitted_answers"]`, `data["partial_scores"]`, `data["feedback"]`, `data["format_errors"]`.

## Rules

1. **Adding a new key to a persisted dict?** Every reader in every element function must use `dict.get(key, default)` with a sensible default, never `dict[key]`. This applies to top-level keys and to keys inside any nested per-block / per-answer dict stored inside a persisted field. If the element uses a `TypedDict` for the nested shape, mark the new field `NotRequired[...]` from `typing_extensions` so pyright catches unguarded reads.

2. **Renaming, removing, or changing the semantics of a persisted key?** Don't. Keep the old key alongside the new one and have readers fall back to it when the new one is missing. Old rows still hold the old shape forever.

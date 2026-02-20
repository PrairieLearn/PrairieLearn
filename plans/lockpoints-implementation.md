# Lockpoints Implementation Notes

## Completed scope

- Added database support for zone lockpoints and per-assessment-instance lockpoint crossings.
- Added schema/sync support for `lockpoint` in `infoAssessment.json`, including validation:
  - first zone cannot be a lockpoint
  - lockpoint zones cannot set `numberChoose: 0`
- Extended `question_order()` with:
  - `lockpoint_not_yet_crossed`
  - `lockpoint_read_only`
- Added student lockpoint crossing flow on assessment overview page (`cross_lockpoint` action).
- Added server-side submission blocking for lockpoint read-only questions.
- Added lockpoint-aware next-question disabling on instance-question pages.
- Added student and instructor UI indicators for lockpoint state and crossing details.
- Added assessment-instance log event for lockpoint crossing.

## Deviations from plan

- Crossed-at timestamps shown in UI are formatted in SQL using course-instance timezone (`format_date_full_compact`), instead of formatting `Date` values in template code.
- Integration testing coverage was implemented for core lockpoint lifecycle behavior in a dedicated test (`testLockpoints.test.ts`), but not every listed scenario from the draft plan was implemented in this pass.

## Notes

- Cross-lockpoint requests are idempotent via `ON CONFLICT DO NOTHING` + follow-up existence check.
- Non-submission actions (e.g., personal notes) remain unblocked for lockpoint read-only questions.

## Architecture updates (2026-02-14)

- Replaced multiple lock-state booleans as the primary control path with one canonical `question_access_mode` value across SQL, middleware, and UI:
  - `writable`
  - `blocked_sequence`
  - `blocked_lockpoint`
  - `read_only_lockpoint`
- Added a non-implementation design sketch in `plans/lockpoints.md` for moving lockpoint crossing to a dedicated transactional domain command boundary.

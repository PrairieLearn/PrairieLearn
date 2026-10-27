# scripts

This directory contains various scripts that are used internally to develop PrairieLearn. They are not intended for use by end users of PrairieLearn. See [the `contrib` directory](../contrib) for useful tools for course content development and operation that have been contributed by the PrairieLearn community.

## Legacy question authors

Run the read-only audit against course directories or a directory containing course repositories:

```sh
pnpm --filter @prairielearn/prairielearn exec tsx ../../scripts/audit-question-authors.mts /absolute/path/to/courses
```

The script emits JSON lines with the course, QID, legacy author entry, and whether its email can be converted to a UID. Run it across all course repositories before removing legacy support. Assign UIDs manually for unconvertible entries, then replace structured entries with UID strings.

The `question_author_uids` table is populated from course files on sync; the migration does not backfill from the legacy tables. Deploy the UID writer and sync all courses before relying on UID queries across courses. The old `authors` and `question_authors` tables remain untouched during this transition. Remove them in a later migration only after all servers use the new writer and the file audit reports no legacy entries.

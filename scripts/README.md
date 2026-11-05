# scripts

This directory contains various scripts that are used internally to develop PrairieLearn. They are not intended for use by end users of PrairieLearn. See [the `contrib` directory](../contrib) for useful tools for course content development and operation that have been contributed by the PrairieLearn community.

## Question authors rollout

The `questions.authors` column is populated from course files on each course's next sync; the migration does not backfill from the legacy tables. Deploy the UID writer and sync all courses before relying on UID queries across courses. Sync no longer writes to the old `authors` and `question_authors` tables. They remain during this transition and will be removed in a follow-up migration after all servers use the new writer.

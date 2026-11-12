# scripts

This directory contains various scripts that are used internally to develop PrairieLearn. They are not intended for use by end users of PrairieLearn. See [the `contrib` directory](../contrib) for useful tools for course content development and operation that have been contributed by the PrairieLearn community.

## Question authors rollout

Question authors are stored in `questions.authors` from UID or ORCID URL strings in course files.

Before deploying this cleanup:

- Confirm all servers have deployed the new authorship writer (#16170).
- Verify current course files have been migrated from legacy objects, preserving the agreed UIDs and ORCID URLs.
- Resync courses with the new writer and confirm `questions.authors` is populated before dropping the legacy tables. The cleanup migration does not backfill data or rewrite course files.

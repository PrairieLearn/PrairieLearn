---
name: groups-and-teams
description: Dealing with groups and teams in PrairieLearn, and confusion about table/column/variable names.
---

The codebase contains a half-completed migration from "teams" to "groups". As a result, there are many places where the old and new terminology coexist, which can be confusing.

The database table and column names currently use "teams" (e.g. `teams` and `team_roles` tables, and `team_id` columns). All new and existing code should continue to use the "teams" terminology when interacting with the database, as it is not currently safe to rename these tables and columns.

Database queries may alias teams tables/columns to use groups terminology, e.g. `teams AS g` or `team_users AS tu`. This is acceptable and encouraged.

User-facing functionality (UI, CSV exports, etc.), function/variable names, and Zod schema/type names use "groups" (e.g. `Group`, `GroupConfig`, and `GroupRole` types and schemas). All new and existing code should use the "groups" terminology in these contexts.

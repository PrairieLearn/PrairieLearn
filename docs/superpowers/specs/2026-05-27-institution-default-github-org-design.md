# Institution default GitHub organization

**Issue:** [#14696](https://github.com/PrairieLearn/PrairieLearn/issues/14696)
**Date:** 2026-05-27
**Status:** Approved (pending implementation)

## Problem

Approved course requests always create their repositories in the `PrairieLearn` GitHub org (`config.githubCourseOwner`). Some institutions want to centralize their course repositories in a different org, and today that requires a manual repo transfer after creation.

## Goal

Let global admins set a default GitHub organization on each institution. When an approved course request is converted to a course, that institution's default is used as the destination org (admin can still override per request). Saving a non-null default validates that the PrairieLearn machine account actually has access to the org.

Out of scope: full "bring your own repository" support, per-course (not per-institution) org overrides outside the create-course form.

## Decisions

- **Pre-fill, editable.** Course-creation form pre-fills with the institution's default org, but the admin can override the value for a one-off request.
- **Required to save (and to override).** Setting a non-null default org triggers `GET /orgs/{org}` + `GET /orgs/{org}/memberships/{machine_user}`. Both must pass or the save is rejected. No separate "Test access" button — the save flow IS the test. Clearing the field (setting to null) skips validation. The same check runs synchronously in the tRPC `createCourse` procedure to validate per-request overrides, so typos don't get past the form into the background job.
- **Skip the check when the value equals `config.githubCourseOwner`.** Compared case-insensitively because GitHub org names are case-insensitive. The platform-default org is already known-good (the platform couldn't function otherwise). Skipping here also means the feature works before `githubMachineUser` is configured, as long as no one overrides off the default.
- **New `githubMachineUser` config key.** Explicit username for the membership check. If unset, saving a non-null org is rejected with a config-error message.
- **Selected org only for conflict checks.** `checkGithubRepositoryExists` runs against the org the admin actually selected — not also against the legacy `PrairieLearn` org.
- **Threaded parameter, not config read.** `lib/github.ts` stops reading `config.githubCourseOwner` directly. Callers pass the owner in. The config value remains the fallback default when an institution hasn't set one.

## Architecture

One new column (`institutions.github_course_owner`), one new config key (`githubMachineUser`), one save-time validator (`checkGithubOrgAccess`), and a refactor that threads `githubCourseOwner` through the course-creation pipeline as an explicit parameter.

## Components

### 1. Database

Migration: `apps/prairielearn/src/migrations/<timestamp>_institutions__github_course_owner__add.sql`

```sql
ALTER TABLE institutions ADD COLUMN github_course_owner TEXT;
```

Update:

- `database/tables/institutions.pg` (new column row).
- `apps/prairielearn/src/lib/db-types.ts` — add `github_course_owner: z.string().nullable()` to `InstitutionSchema`.
- `apps/prairielearn/src/lib/client/safe-db-types.ts` — add `github_course_owner: true` to `RawAdminInstitutionSchema.pick(...)`. Staff schema does not need it.

### 2. Config

Add to `apps/prairielearn/src/lib/config.ts` next to the existing GitHub keys:

```ts
githubMachineUser: z.string().nullable().default(null),
```

### 3. Access check (new function in `lib/github.ts`)

```ts
export type GithubOrgAccessResult =
  | { ok: true }
  | { ok: false; reason: 'no_client' | 'no_machine_user' | 'org_unreachable' | 'not_a_member'; detail?: string };

export async function checkGithubOrgAccess(org: string): Promise<GithubOrgAccessResult>;
```

Behavior:

- `config.githubClientToken == null` → `{ ok: false, reason: 'no_client' }`.
- `config.githubMachineUser == null` → `{ ok: false, reason: 'no_machine_user' }`.
- `client.orgs.get({ org })` 404/403 → `org_unreachable`.
- `client.orgs.getMembershipForUser({ org, username })` 404/403 → `not_a_member`.
- 200 but `data.state !== 'active'` (e.g., `'pending'` — invited, not yet accepted) → `not_a_member` with `detail: 'pending'` so the message can mention the unaccepted invite.
- Both pass with `state: 'active'` → `{ ok: true }`.

Unexpected errors (5xx, network) re-throw — they aren't an "access denied" answer, and the handler should treat them as a normal server error.

### 4. `lib/github.ts` refactor

- `createCourseRepoJob` options gains required `github_course_owner: string`. Internal helpers (`createEmptyRepository`, `addFileToRepo`, `addTeamToRepo`, `addUserToRepo`, `listBranches`, SSH URL construction) take the owner as a parameter or close over the function-local value instead of reading `config.githubCourseOwner` directly.
- `checkGithubRepositoryExists(repoName: string, owner: string)` — owner becomes a required arg.
- All other `config.githubCourseOwner` reads in `lib/github.ts` go away.

### 5. tRPC course-creation

`apps/prairielearn/src/trpc/administrator/course-requests.ts`:

- Add `githubCourseOwner: z.string().min(1)` to the `createCourse` input schema.
- If `input.githubCourseOwner !== config.githubCourseOwner`, run `checkGithubOrgAccess` first; on failure, throw a `BAD_REQUEST` tRPC error with a human-readable message keyed to the `reason`. (See "Reason → message mapping" below.)
- Pass `githubCourseOwner` to `checkGithubRepositoryExists` and to `createCourseFromRequest`.
- The `CONFLICTS` error's `githubRepoUrl` uses `input.githubCourseOwner` instead of `config.githubCourseOwner`.

`apps/prairielearn/src/lib/course-request.ts`:

- `createCourseFromRequest` signature gains `githubCourseOwner: string`. Pass through to `createCourseRepoJob` as `github_course_owner`.

### 5b. Auto-approval path (`instructorRequestCourse.ts`)

The auto-approval branch (`config.courseRequestAutoApprovalEnabled && canAutoCreateCourse`) currently calls `createCourseRepoJob` with no explicit owner. Update it to:

- Read `github_course_owner` from the institution found in `get_existing_owner_course_settings` (extend that query to return it, or join in the parent query).
- Resolve `github_course_owner ?? config.githubCourseOwner` as the org.
- If the resolved value !== `config.githubCourseOwner`, run `checkGithubOrgAccess`. On failure, do NOT auto-create — skip the auto-approval branch and let the request sit as `pending` for an admin to handle. Log the access-check failure (`logger.error` + `Sentry.captureException`) and post a Slack message via `opsbot.sendCourseRequestMessage` explaining that the request was created but auto-creation was skipped because of org access. The instructor sees the same response as a normal non-auto request.

This keeps the failure path simple (existing pending-request flow) instead of inventing a new error UX for instructors.

### 6. Course-request UI

`apps/prairielearn/src/pages/administratorCourseRequests/administratorCourseRequests.tsx`:

- Pass `defaultGithubCourseOwner: config.githubCourseOwner` into the React tree alongside `coursesRoot`. This is the fallback shown when the selected institution has no per-institution value.

`apps/prairielearn/src/pages/administratorCourseRequests/components/CourseRequestsTable.tsx`:

- Add a "GitHub organization" text input to the create-course form. Default value derived from the selected institution: `institution.github_course_owner ?? defaultGithubCourseOwner`. Re-syncs when the institution selection changes (mirror the existing pattern for `path`/`repoShortName` defaults).
- Helper text: brief note that this controls where the new repo is created.
- Field is required (no empty submission).
- Include `githubCourseOwner` in the tRPC `createCourse` mutation call.

### 7. Institution settings UI

`apps/prairielearn/src/ee/pages/administratorInstitutionGeneral/administratorInstitutionGeneral.html.ts`:

- New section between "UID regexp" and "Limits" (or below "Limits" — wherever fits the visual hierarchy). Single text input labeled "Default GitHub organization", with helper text:
  > "When approved course requests for this institution are turned into courses, repositories are created in this GitHub org. Leave blank to use the platform default. Saving verifies the PrairieLearn machine account has access."
- Separate form/action `update_github_course_owner` so the validation only runs when this field changes. This avoids forcing every unrelated edit through a GitHub round-trip.

`apps/prairielearn/src/ee/pages/administratorInstitutionGeneral/administratorInstitutionGeneral.ts`:

- New `__action === 'update_github_course_owner'` branch.
- If `req.body.github_course_owner` is empty/whitespace, treat as null and persist without validation.
- Otherwise, if `value !== config.githubCourseOwner`, call `checkGithubOrgAccess(value)`. On failure, `flash('error', humanReadableMessage(result))` and redirect back. On success (or when the value equals the platform default), update inside a transaction with `insertAuditLog`.

`administratorInstitutionGeneral.sql`:

- New `update_github_course_owner` query that updates only the new column and returns the row.

### 8. Reason → message mapping

A small helper in the settings handler:

| Reason | Message |
|---|---|
| `no_client` | "GitHub integration is not configured on this server." |
| `no_machine_user` | "GitHub machine user is not configured; cannot validate org access." |
| `org_unreachable` | "Could not access GitHub organization '<org>'. Confirm the org exists and the machine account has been invited." |
| `not_a_member` (no detail) | "GitHub user '<machine_user>' is not a member of '<org>'. Add the account to the org and try again." |
| `not_a_member` (detail: 'pending') | "GitHub user '<machine_user>' has not yet accepted the invitation to '<org>'. Accept the invitation and try again." |

## Data flow

```
admin saves institution settings
  └─> POST administratorInstitutionGeneral
        └─> checkGithubOrgAccess(org)
              ├─> ok → UPDATE institutions SET github_course_owner = $1; insertAuditLog
              └─> not ok → flash error, no DB write

admin approves a course request
  └─> CourseRequestsTable form
        └─> tRPC createCourse(..., githubCourseOwner)
              └─> checkGithubRepositoryExists(repoName, githubCourseOwner)
              └─> createCourseFromRequest(..., githubCourseOwner)
                    └─> createCourseRepoJob({ ..., github_course_owner })
                          └─> creates repo in the chosen org
```

## Error handling

- Settings save with access failure: flash error, no DB write, form re-renders with the user's input preserved (per existing pattern).
- Course creation with stale access (org was reachable on save, isn't now): the existing background-job failure path marks the request `failed` and posts to Slack. No new branch needed.
- Unexpected 5xx from GitHub during the test: bubble up as a 500. We're not silently swallowing transient failures and persisting an unverified value.

## Testing

- **Unit:** `checkGithubOrgAccess` with a mocked Octokit via `vi.mock('@octokit/rest', ...)`. Cover all five outcomes (`no_client`, `no_machine_user`, `org_unreachable`, `not_a_member` x2 — active-absent and pending) plus the happy path. The codebase has no prior pattern for this; the new test file sets the precedent.
- **tRPC:** `createCourse` propagates the form's `githubCourseOwner` into the options passed to `createCourseRepoJob`, and short-circuits the access check when the value matches the platform default (case-insensitive). Mock `createCourseRepoJob` and `checkGithubOrgAccess`; assert call counts and arguments.
- **Settings handler:** Skip a true HTTP integration test for the GitHub round-trip (would require a new mock seam that's overkill for this feature). Cover via the unit test of `checkGithubOrgAccess` plus a focused test that the handler calls it when the org changes and skips it when value matches the default.
- **Manual:** Set a default org on an institution, run through the create-course flow, confirm the repo lands in the right org. Negative cases: (a) clear the org, confirm fallback to `config.githubCourseOwner`; (b) save an org the bot isn't in, confirm flash error and no DB write; (c) auto-approval path with a misconfigured institution org falls back to pending.

## What this design does NOT include

- A standalone "Test access" button. The save action is the test.
- Per-course org override after course creation (institution-level only, plus the per-request form override).
- Migration of existing courses to a different org.
- Validation that the chosen org has been added to `config.githubMachineTeam` (the team-add call will fail at job time if it hasn't; that's existing behavior).

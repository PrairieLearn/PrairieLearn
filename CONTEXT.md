# PrairieLearn — modern assessment access control

Language for the modern access control system (per-assessment `accessControl` configuration replacing legacy `allowAccess`), as used by authorization, the access editor, and the assessment calendar view.

## Language

**Access rule**:
One access control configuration attached to an assessment, identified by `number` and `target_type`.
_Avoid_: access policy, access config

**Default rule**:
The access rule with `number === 0` and `target_type === 'none'`; it applies to students not covered by an override.
_Avoid_: base rule, main rule

**Override rule**:
Any non-default access rule, targeting either a student label or individual enrollments.
_Avoid_: exception, special rule

**Release date**:
The instant an assessment becomes accessible to a student under a rule.
_Avoid_: open date, start date (legacy `allowAccess` term)

**Due date**:
The deadline through which the rule's due credit (default 100%) applies; `due: { date: null }` grants that credit indefinitely ("indefinite due").
_Avoid_: end date (legacy term — the due date is not when access ends)

**Final deadline**:
The last of {early deadlines, due date, late deadlines} after validation filtering; credit changes stop here.
_Avoid_: last due date, close date

**Availability window**:
The span from release date to final deadline during which submissions earn scheduled credit; open-ended under an indefinite due.
_Avoid_: access period

**Access timeline**:
The ordered credit segments (`beforeRelease` → `deadline`\* → `afterLastDeadline` | `noDeadline`) built by `buildAccessTimeline`; an empty timeline means "no usable access path."

**Listed before release**:
A `beforeRelease.listed: true` assessment appears to students as "coming soon" — possibly perpetually, when no dates are configured.

**Calendar event**:
The render-ready projection of one assessment's resolved date control (release/due chips + availability window bar), produced by `dateControlToCalendarEvents`.

## Relationships

- An **Assessment** has at most one **Default rule** and any number of **Override rules**.
- An **Access timeline** is built from exactly one resolved date control (the resolver merges stacked overrides per student).
- An **Availability window** ends at the **Final deadline**, which is on or after the **Due date**.
- A **Calendar event** is derived from an **Access timeline** and exists only when the timeline is non-empty.

## Example dialogue

> **Dev:** "If an instructor adds a late deadline, does the **Availability window** end at the **Due date**?"
> **Domain expert:** "No — the window runs to the **Final deadline**. The **Due date** is just where credit drops from due credit; and with `afterLastDeadline.allowSubmissions`, submissions can continue even after the window, at reduced credit."

## Flagged ambiguities

- "due date" was used to mean both the 100%-credit deadline and the last submittable instant — resolved: those are **Due date** and **Final deadline**, distinct concepts.
- "start/end dates" are legacy `allowAccess` vocabulary and must not be used for modern rules — resolved: **Release date** / **Final deadline**.
- "the assessment's dates" is ambiguous under overrides — resolved: dates are always per-rule; student-facing surfaces show the resolver's merged result, instructor-facing summaries show the **Default rule** plus an override count.

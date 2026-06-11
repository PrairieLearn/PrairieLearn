# Assessment calendar view — design

**Date:** 2026-06-11 (grilled & sharpened 2026-06-11)
**Branch:** `reteps/assessment-calendar-view`
**Status:** Approved

## Summary

A read-only month-grid calendar showing assessment dates derived from modern access control, available to both instructors and students as a view toggle on their existing assessments pages. Built as a custom React grid (no calendar library; see ADR-0001), hydrated as an island on otherwise non-hydrated pages.

## Goals

- Instructors see the course instance's assessment schedule (release dates, due dates, availability windows) at a glance and can spot conflicts.
- Students see their own resolved dates, including any per-student or per-label overrides that apply to them.
- No editing from the calendar in v1; clicking an event shows details and links out.

## Non-goals (v1)

- Editing dates from the calendar (drag to reschedule).
- Rendering legacy `allowAccess` assessments. They are omitted with no notice; the calendar covers only assessments with `modern_access_control = true`.
- A semester timeline (Gantt) view. The event model should not preclude it, but it is not built now.
- Early/late deadlines as their own calendar events (they appear in the detail popover only; the availability window bar spans through the final deadline).
- PrairieTest-scheduled exam windows. `pt_exams` carries no schedule data locally (only name/course; sessions and reservations are per-student bookings), so an assessment gated purely by a PrairieTest integration produces no calendar events. If such an assessment also has date control dates, those render normally.

## Decisions and rationale

| Decision      | Choice                                                          | Rationale                                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience      | Both, one shared component                                      | Same rendering, different data derivation per page                                                                                                                                                                                     |
| Layout        | Month grid with spanning window bars + date chips ("style A")   | Most conventional; chosen over Gantt and agenda via mockups                                                                                                                                                                            |
| Library       | Custom CSS-grid component (ADR-0001)                            | Zero new deps, exact Bootstrap styling; react-aria's Calendar is a date-picker primitive, not an event calendar; free libraries offer no path to a future timeline view (FullCalendar/Schedule-X gate it behind paid tiers)            |
| Placement     | View toggle on `instructorAssessments` and `studentAssessments` | Discoverable, no new routes. The toggle is a plain server-rendered link pair switching `?view=calendar`; the Express handler picks which body to render. nuqs manages only `?month` _inside_ the hydrated island (no full reload)      |
| Overrides     | Resolved per viewer                                             | Students get resolver output (their dates); instructors see the default rule plus an override-count badge                                                                                                                              |
| Interactivity | Read-only + navigation                                          | Month prev/next/today, event click → detail popover with links                                                                                                                                                                         |
| Data flow     | Server-derived props, no tRPC                                   | A semester is tens of events; loaders pass everything, month navigation is client-side. `Hydrate` serializes via superjson, so `Date` values survive to the client untouched. Switching to a tRPC query later would not touch the grid |
| Derivation    | One shared mapper from resolved date control                    | Both audiences produce events through `buildAccessTimeline` semantics — no parallel reimplementation of deadline drop/clamp rules (see "Event derivation")                                                                             |

## Event derivation

There is exactly **one** mapper, `dateControlToCalendarEvents(dateControl: RuntimeDateControl | null)`, used by both audiences. It internally reuses `buildAccessTimeline` (`lib/assessment-access-control/timeline.ts`) so deadline filtering rules (late deadlines before an overridden due date are dropped, same-timestamp deadlines collapse, etc.) are never reimplemented.

Mapping rules, in terms of the timeline:

- **Omit** the assessment when the timeline is empty (no release configured, or due ≤ release — "no usable access path"). A non-empty timeline always has a release date, so `window.start` is non-nullable.
- `release` = end of the `beforeRelease` segment (entry 0).
- `due` = `dateControl.due.date`. `due: { date: null }` (indefinite due) means no due chip and an open-ended window.
- `window` = `[release, end of the final 'deadline' segment]`; open-ended when the timeline ends in a `noDeadline` segment.
- `lateUntil` = end of the final `deadline` segment, when later than `due` (popover only).
- `afterLastDeadline: { allowSubmissions: true }` does **not** extend the window bar; it appears as a popover row ("submissions accepted after the final deadline at N% credit"), matching the timeline's trailing `afterLastDeadline` segment.

### Per-audience inputs

- **Instructor:** the **default rule** is defined as `number === 0 && target_type === 'none'` (per `models/assessment-access-control-rules.ts`). The existing `selectAccessControlRulesForCourseInstance` already batch-loads every rule per assessment in one query, so no new model function was needed; `overrideCount` = number of non-default rules. Modern assessments without a default rule are omitted.
- **Student:** extend `AccessControlResolverResult` (in `lib/assessment-access-control/resolver.ts`) with the resolved date control the resolver already computes internally (raw data; display is a UI concern, consistent with the existing `accessTimeline` field). The staff-override path also exposes the merged date control so staff previewing the student page see the same calendar a default student would. The `studentAssessments` loader already filters rows to `authorized || show_before_release`; the calendar uses the same filtered rows, so listed-but-undated ("coming soon") assessments appear in the list view but produce no calendar events.

### Event shape

The mapper produces the shared date fields; each page adds identity/link fields:

```ts
interface CalendarEventDates {
  release: Date; // chip; also the availability window's start
  due: Date | null; // chip; null for indefinite due
  windowEnd: Date | null; // final deadline; null = indefinite
  afterLastDeadlineCredit: number | null; // popover note, when submissions continue after the final deadline
  timeline: AccessTimelineEntry[]; // popover credit table (late/early deadlines appear here)
}

interface CalendarAssessmentEvent extends CalendarEventDates {
  assessmentId: string;
  title: string;
  label: string; // assessment set badge text, e.g. "HW3"
  color: string; // assessment set color
  assessmentUrl: string | null; // null when the viewer can't open it yet
  accessEditUrl: string | null; // instructor with course edit permission only
  overrideCount: number; // instructor: non-default rules; 0 for students
}
```

Deadlines are exclusive instants (credit applies strictly before them), so day
bucketing for due chips and window ends uses `deadline - 1ms` — an
exact-midnight deadline renders on the preceding day.

## Timezones

All day bucketing (which calendar cell an instant falls in, "today" highlighting, the default month) uses the course instance `display_timezone`, never the browser timezone — an 11:59 PM due date must land on the right day for every viewer. The timezone string is passed as a prop and instants are converted with `@js-temporal/polyfill` (already a dependency; `@date-fns/tz` is not installed and not added). Formatting of displayed dates uses `@prairielearn/formatter`.

## Components

All in `apps/prairielearn/src/components/` (app-specific; uses app types):

- `AssessmentCalendar` — hydrated wrapper. Header with month title, prev/next/today; `?month=YYYY-MM` in nuqs; navigation clamped to [first event month, last event month]; default month = current month in course timezone. Registered in `assets/scripts/esm-bundles/hydrated-components`.
- `MonthGrid` / `WeekRow` — CSS-grid weeks; each week renders day numbers plus lane-stacked bar/chip rows.
- `computeWeekLanes(spans, week)` — pure function: splits availability windows at week boundaries and assigns lane indices so overlapping bars stack. The component collapses lanes past a max (3 per week) into a "+N more" expander. Lives outside React; unit-tested.
- `WindowBar`, `EventChip` — window bars use the assessment set color at low opacity with a solid left edge; due chips solid; release chips solid with distinct icon. Both render as buttons with complete accessible labels (e.g. "Homework 3, due Friday, March 20, 11:59 PM"), since the visual bar/chip text is truncated.
- Detail popover — react-bootstrap `OverlayTrigger`, following the existing `StudentAccessPopovers` pattern: set badge, override-count badge (instructor), opens/due/late/after-deadline rows from the credit timeline, "View assessment" and (instructor, with edit permission) "Edit access" links.
- Colors reuse existing assessment-set color classes.

## Page integration

- `instructorAssessments` and `studentAssessments` gain a list/calendar toggle (server-rendered links setting `?view`). The pages remain html-template rendered; only the calendar is hydrated via `<Hydrate>` with the events passed as props (superjson handles `Date` serialization).
- Both loaders compute the events array server-side (instructor: new batch rules query; student: already-computed resolver results).

## Edge cases

- `due: { date: null }` grants the rule's credit indefinitely → open-ended window bar, no due chip.
- Assessments with zero rules, no default rule (instructor view), an empty timeline, or only a PrairieTest integration are omitted.
- Past months remain navigable; windows entirely in the past render normally.
- Months with no events render an empty grid (navigation clamping makes this rare).

## Testing

- Vitest: `dateControlToCalendarEvents` (release/due/lateUntil mapping, indefinite due, empty timeline omission, after-last-deadline credit) and `computeWeekLanes` (week-boundary splits, lane packing, open-ended windows, overflow).
- Playwright e2e (one per audience): toggle to calendar view on the test course, assert a known assessment's due chip renders and its popover shows the expected dates/links.

## Future directions (explicitly out of scope)

- Semester timeline (Gantt) view reusing the same event model.
- Drag-to-reschedule writing back through the access-control save mutation.
- Early/late deadlines as first-class calendar events.
- PrairieTest exam session windows, if schedule data becomes available locally.
- iCal export.

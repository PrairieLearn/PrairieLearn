# Assessment calendar view — design

**Date:** 2026-06-11
**Branch:** `reteps/assessment-calendar-view`
**Status:** Approved

## Summary

A read-only month-grid calendar showing assessment dates derived from modern access control, available to both instructors and students as a view toggle on their existing assessments pages. Built as a custom React grid (no calendar library), hydrated as an island on otherwise non-hydrated pages.

## Goals

- Instructors see the course instance's assessment schedule (release dates, due dates, availability windows) at a glance and can spot conflicts.
- Students see their own resolved dates, including any per-student or per-label overrides that apply to them.
- No editing from the calendar in v1; clicking an event shows details and links out.

## Non-goals (v1)

- Editing dates from the calendar (drag to reschedule).
- Rendering legacy `allowAccess` assessments. They are omitted with no notice; the calendar covers only assessments with `modern_access_control = true`.
- A semester timeline (Gantt) view. The event model should not preclude it, but it is not built now.
- Early/late deadlines as their own calendar events (they appear in the detail popover only; the availability window bar spans through the last deadline).

## Decisions and rationale

| Decision      | Choice                                                                                      | Rationale                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience      | Both, one shared component                                                                  | Same rendering, different data derivation per page                                                                                                                                                                          |
| Layout        | Month grid with spanning window bars + date chips ("style A")                               | Most conventional; chosen over Gantt and agenda via mockups                                                                                                                                                                 |
| Library       | Custom CSS-grid component                                                                   | Zero new deps, exact Bootstrap styling; react-aria's Calendar is a date-picker primitive, not an event calendar; free libraries offer no path to a future timeline view (FullCalendar/Schedule-X gate it behind paid tiers) |
| Placement     | View toggle on `instructorAssessments` and `studentAssessments` (`?view=calendar` via nuqs) | Discoverable, no new routes                                                                                                                                                                                                 |
| Overrides     | Resolved per viewer                                                                         | Students get resolver output (their dates); instructors see the default rule plus an override-count badge                                                                                                                   |
| Interactivity | Read-only + navigation                                                                      | Month prev/next/today, event click → detail popover with links                                                                                                                                                              |
| Data flow     | Server-derived props, no tRPC                                                               | A semester is tens of events; loaders pass everything, month navigation is client-side. Switching to a tRPC query later would not touch the grid                                                                            |

## Data model

A common event shape derived server-side by each page:

```ts
interface CalendarAssessmentEvents {
  assessment_id: string;
  title: string;
  color: string; // assessment set color
  setAbbr: string; // assessment set abbreviation for the badge
  assessmentUrl: string;
  accessEditUrl?: string; // instructor only
  window: { start: Date | null; end: Date | null }; // release → last deadline; null end = no due date
  release?: Date; // chip
  due?: Date; // chip
  lateUntil?: Date; // popover detail
  overrideCount?: number; // instructor only: non-default rules
}
```

- **Instructor derivation:** batch-load access-control rules for modern assessments (`selectAccessControlRules` / models in `models/assessment-access-control-rules.ts`), take the default rule's dates, count non-default rules into `overrideCount`.
- **Student derivation:** map the existing `resolveModernAssessmentAccessResultsBatch` output (`access_timeline: AccessTimelineEntry[]`, from `lib/assessment-access-control/timeline.ts`). The resolver already applies overrides and filters unlisted / before-release assessments.
- Dates are formatted in the course instance timezone using `@prairielearn/formatter`.

## Components

All in `apps/prairielearn/src/components/` (app-specific; uses app types):

- `AssessmentCalendar` — hydrated wrapper. Header with month title, prev/next/today; `?month=YYYY-MM` in nuqs; navigation clamped to [first event month, last event month]. Registered in `assets/scripts/esm-bundles/hydrated-components`.
- `MonthGrid` / `WeekRow` — CSS-grid weeks; each week renders day numbers plus lane-stacked bar/chip rows.
- `computeWeekLanes(events, week)` — pure function: splits availability windows at week boundaries, assigns lane indices so overlapping bars stack, collapses past a max lane count (3 lanes per week) into a "+N more" expander. Lives outside React; unit-tested.
- `WindowBar`, `EventChip` — window bars use the assessment set color at low opacity with a solid left edge; due chips solid; release chips solid with distinct icon (`▸` opens / `⏰` due).
- Detail popover — react-bootstrap `OverlayTrigger`, following the existing `StudentAccessPopovers` pattern: set badge, override-count badge (instructor), opens/due/late rows from the credit timeline, "View assessment" and (instructor, with edit permission) "Edit access" links.
- Colors reuse existing assessment-set color classes.

## Page integration

- `instructorAssessments` and `studentAssessments` gain a list/calendar toggle. The pages remain html-template rendered; only the calendar is hydrated via `<Hydrate>` with the events passed as props.
- Both loaders compute the events array server-side (instructor: rules query; student: already-computed resolver results).

## Edge cases

- `due: { date: null }` grants the rule's credit indefinitely → open-ended window bar, no due chip.
- Assessments with zero rules or no dates are omitted.
- Past months remain navigable; windows entirely in the past render normally.
- Months with no events render an empty grid (navigation clamping makes this rare).

## Testing

- Vitest: event-derivation mappers (instructor rule → events, student timeline → events) and `computeWeekLanes` (week-boundary splits, lane packing, null end dates, overflow).
- Playwright e2e (one per audience): toggle to calendar view on the test course, assert a known assessment's due chip renders and its popover shows the expected dates/links.

## Future directions (explicitly out of scope)

- Semester timeline (Gantt) view reusing the same event model.
- Drag-to-reschedule writing back through the access-control save mutation.
- Early/late deadlines as first-class calendar events.
- iCal export.

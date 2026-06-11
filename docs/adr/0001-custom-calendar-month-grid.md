# Custom-built month grid for the assessment calendar view

The assessment calendar view renders a month grid with multi-day availability bars using a custom React/CSS-grid component instead of a calendar library. We evaluated FullCalendar, react-big-calendar, Schedule-X, and react-aria: react-aria's `Calendar` is a date-picker primitive (selection-oriented cells, no event rendering); FullCalendar and Schedule-X gate timeline/resource views behind paid licenses, foreclosing the planned semester-timeline follow-up; react-big-calendar is free but fights Bootstrap styling and still offers no timeline path. A read-only month grid only needs ~200 lines of lane-layout logic (`computeWeekLanes`), so we own that in exchange for zero new dependencies, native Bootstrap styling, and an event model shared with a future custom timeline view.

**Status:** accepted

## Consequences

- Week-boundary splitting and lane packing for window bars is our code and must stay unit-tested; there is no library to lean on.
- If the calendar ever needs drag-to-reschedule or week/day views, re-evaluate against this ADR — that's the point where library leverage starts outweighing styling control.

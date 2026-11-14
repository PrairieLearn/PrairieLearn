---
name: migrate-course-instance
description: Set up a PrairieLearn course instance for a new term from an existing one, moving every assessment date onto the new term's academic calendar and clearing what belonged to the old term's students. Use for requests such as "Set up Spring 2027 from Fall 2026" or "Shift our deadlines to next term's calendar".
---

# Migrate a course instance to a new term

Give the instructor a new course instance that runs this term the way the old one ran last term:

- each assessment in the same week of instruction, on the same weekday and time
- no deadline on a holiday or in a break unless someone approved it
- nothing carried over from last term's students
- it syncs without errors

The instructor should only have to answer one proposal before the changes go to review.

## Exercise judgment

"Same week, same weekday" is the default, not the goal. When a date doesn't fit the course's pattern, place it by the pattern and say so. Examples: a deadline the mapping pushes into a break, a practice quiz still set to 2024, or a window that shrinks to hours.

Treat everything tied to one term as a decision with a sensible default, not something to fix silently or ask about one at a time. That includes per-student rules, PrairieTest exams, questions named for the old term, and leftover dates.

## Boundaries

- Never edit the source course instance or anything outside the new course instance. Questions are shared by every offering.
- Never copy or print student identifiers. Report per-student rules as counts.
- Don't invent what only the instructor or PrairieLearn knows: PrairieTest exams, accommodations, staff.

## Steps

Keep your working files (calendar notes, the plan, the table of moves) in `~/migration`, outside the course, so they stay out of the review.

1. **Scope.** Find the source course instance (the one named, else the latest of the same kind), the target term's name in the course's convention, and the timezone. Dates are local to the course instance's timezone; if it changes, ask. If the target term has already started, say so first.
2. **Calendars.** Get each term's official academic calendar, which you can find on the web: first and last day of instruction, holidays, breaks, finals, and the add deadline. If you can't find one, infer it from the course's history and say which dates are inferred. See [references/calendars.md](references/calendars.md).
3. **Copy.** Copy the source course instance's folder to a new one, or use the copy the instructor already made in PrairieLearn. See [references/copying.md](references/copying.md).
4. **Plan.** Work out a new value for every date in the copy: the same week of instruction, weekday and time in the target term, counting weeks of instruction so that breaks don't shift what follows them. Then check every date that is unusual (on a holiday, in a break, outside the source term, out of order, or in a window that shrank), and spot-check each assessment set against its pattern (for example, "homework opens Tuesday 08:00 and is due the next Tuesday 23:59").
5. **Propose.** Build a table of where each assessment moved, with columns: assessment, ID, current release, current due date, new release, new due date, notes. Notes appear only where something needs a look, such as "Due date Tuesday instead of Monday: Mon Sep 7 is Labor Day", "Now spans spring break: open 14 days, was 7", or "Release was left over from 2024". Send one message:
   - the calendars, with their sources
   - each assessment set's pattern
   - the table, or only its rows with notes when it's long
   - the decisions, each with your default

   Close with "Anything different this term?", and apply policy changes as rules ("homework due Fridays"), not row by row. Defaults are in [references/decisions.md](references/decisions.md).

6. **Apply.** Apply the plan with the instructor's decisions to the copy, and remove legacy UID rules and per-student overrides. Edit only the affected text, so the diff shows just the change.
7. **Verify.** Check the copy again against the target calendar. It should have no leftover dates, no unapproved deadlines in breaks, and no per-student rules. Diff the copy against the source: only dates, the removed rules, and the decisions should differ.
8. **Submit for review.** A review takes at most 100 changed files, and every file in the copy counts. For a larger course instance, submit `infoCourseInstance.json` and the first assessment sets, then the rest in later reviews, and tell the instructor how many reviews to expect. PrairieLearn syncs the course on approval; if the sync fails, fix the errors and submit again.

## Handoff

- **Result:** the new course instance, its dates, and how many dates moved.
- **Calendars:** the sources used, and what was inferred.
- **Decisions:** each one applied.
- **To check in PrairieLearn:** a few assessments' **Access** tabs in the new course instance.
- **Still to do in PrairieLearn:**
  - PrairieTest exams to create, with the UUIDs to replace
  - students to add to labels
  - staff permissions
  - the enrollment code
  - LMS links
- **Not checked:** anything you couldn't verify.

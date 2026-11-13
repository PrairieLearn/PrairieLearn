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

The script moves dates mechanically; you decide what each date should mean. "Same week, same weekday" is the default, not the goal. When a date doesn't fit the course's pattern, place it by the pattern and say so. Examples: a deadline the mapping pushes into a break, a practice quiz still set to 2024, or a window that shrinks to hours.

Treat everything tied to one term as a decision with a sensible default, not something to fix silently or ask about one at a time. That includes per-student rules, PrairieTest exams, questions named for the old term, and leftover dates.

## Boundaries

- Never edit the source course instance or anything outside the new course instance. Questions are shared by every offering.
- Never copy or print student identifiers. Report per-student rules as counts.
- Don't invent what only the instructor or PrairieLearn knows: PrairieTest exams, accommodations, staff.

## Steps

Keep the calendar files, `plan.csv`, and `moves.md` in `~/migration`, outside the course, so they stay out of the review. Run the commands from there, with the copy's path as `COPY`.

1. **Scope.** Find the source course instance (the one named, else the latest of the same kind), the target term's name in the course's convention, and the timezone. Dates are local to the course instance's timezone; if it changes, ask. If the target term has already started, say so first.
2. **Calendars.** Write a calendar file for each term from the official academic calendar, which you can find on the web. If you can't find one, infer it from the course's history and say which dates are inferred. See [references/calendars.md](references/calendars.md).
3. **Copy.** Copy the source course instance's folder to a new one, or use the copy the instructor already made in PrairieLearn. See [references/copying.md](references/copying.md).
4. **Plan.** Run the script on the copy. Then read every flagged row yourself, and spot-check each assessment set against its pattern (for example, "homework opens Tuesday 08:00 and is due the next Tuesday 23:59").
   ```sh
   python3 /etc/codex/skills/migrate-course-instance/references/shift_dates.py scan COPY --calendar source.json
   python3 /etc/codex/skills/migrate-course-instance/references/shift_dates.py plan COPY --from source.json --to target.json --csv plan.csv
   ```
5. **Propose.** Put your proposed defaults in `plan.csv`, with a few words in its `reason` column for each date you change ("Mon Sep 7 is Labor Day"). Then build the table of where each assessment moved:

   ```sh
   python3 /etc/codex/skills/migrate-course-instance/references/shift_dates.py report COPY --plan plan.csv --from source.json --to target.json --md moves.md
   ```

   Columns: assessment, ID, current release, current due date, new release, new due date, notes. Each term's breaks, holidays and finals appear as italic rows in that term's columns. Notes appear only where something needs a look, such as "Due date Tuesday instead of Monday: Mon Sep 7 is Labor Day", "Now spans spring break: open 14 days, was 7", or "Release was left over from 2024". Send one message:
   - the calendars, with their sources
   - each assessment set's pattern
   - the table, or only its rows with notes when it's long
   - the decisions, each with your default

   Close with "Anything different this term?", and apply policy changes as rules ("homework due Fridays"), not row by row. Defaults are in [references/decisions.md](references/decisions.md).

6. **Apply.** Put the instructor's decisions in `plan.csv`, each with its reason, run `report` again, then:
   ```sh
   python3 /etc/codex/skills/migrate-course-instance/references/shift_dates.py apply COPY --plan plan.csv
   python3 /etc/codex/skills/migrate-course-instance/references/shift_dates.py strip COPY
   ```
   Both edit only the affected text, so the diff shows just the change. Do the remaining decisions by hand.
7. **Verify.** Run `scan` again with the target calendar. It should report no leftover dates, no unapproved deadlines in breaks, and no per-student rules. Diff the copy against the source: only dates, the removed rules, and the decisions should differ.
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

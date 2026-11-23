---
name: migrate-course-instance
description: Set up a PrairieLearn course instance for a new term from an existing one, moving every assessment date onto the new term's academic calendar and clearing what belonged to the old term's students. Use for requests such as "Set up Spring 2027 from Fall 2026" or "Shift our deadlines to next term's calendar".
---

# Migrate a course instance to a new term

Give the instructor a new course instance that runs this term the way the old
one ran last term:

- each assessment in the same week of instruction, on the same weekday and time
- no deadline on a holiday or in a break unless someone approved it
- nothing carried over from last term's students
- it syncs without errors

The instructor should only have to answer one proposal before the changes go to
review.

## Boundaries

- Never edit the source course instance or anything outside the new one.
  Questions are shared by every offering, so a migration doesn't edit them.
- Never copy or print student identifiers. Report per-student rules as counts.
- Don't invent what only the instructor or PrairieLearn knows, such as
  PrairieTest exams, accommodations, or staff.

## Exercise judgment

"Same week, same weekday" is the default, not the goal. Anything tied to one
term is a decision with a default, listed in the proposal, not something to fix
silently or ask about one at a time:

- **What belonged to last term's students** is dropped: per-student and legacy
  UID rules, extensions, accommodations. Group UID rules by their set of UIDs,
  without showing them, and say what each group appears to be: a set repeated on
  most assessments is usually staff, whom course staff permissions replace; one
  or two UIDs on a few assessments are extensions or accommodations; a group
  that recurs every term fits a [student
  label](https://docs.prairielearn.com/courseInstance/#student-labels).
- **What lives outside the course files** is kept as it is and listed for the
  instructor: PrairieTest exams (name the assessments that need a new exam),
  student label membership, testing rooms for exam-mode rules, staff,
  enrollment codes, LMS links.
- **Dates the mapping can't place well** are placed by their assessment set's
  pattern, such as "due a week after release", and flagged: a deadline that
  lands on a holiday or in a break, a date outside the source term, dates out of
  order, a window that shrinks, or a finals period shorter in the new term.
- **Questions named or dated for a past term,** such as a QID or title with a
  term in any form (`fa26`, `sp25`, "Fall 2026"): leave them, since every
  offering shares them, and list them to replace.
- **Dates written into text,** such as an assessment's `text` or its client
  files: update them in the new course instance by hand and say where.
- If the target term has already started, say so first; they may mean the next
  one.

## Steps

Keep your working files (calendar notes, the plan) in `~/migration`, outside the
course, so they stay out of the review. Read the source in one pass: one short
script that prints, from `infoCourseInstance.json` and every
`infoAssessment.json`, each assessment's set, every date with its place in the file,
and the QIDs it uses. Apply and verify the plan with one script each.

1. **Scope.** Find the source course instance (the one named, else the latest of
   the same kind), the target term's name in the course's convention, and the
   timezone. Dates are local to the course instance's timezone; if it changes,
   ask.
2. **Calendars.** From each term's official academic calendar, on the web, get
   the first and last day of instruction, holidays, breaks, finals, and the add
   deadline, for the [self-enrollment
   cutoff](https://docs.prairielearn.com/courseInstance/#disabling-self-enrollment-after-a-certain-date).
   Record each URL, and
   say when a calendar is tentative. One term can span two calendars, and some
   are PDFs or images; if you can't read one, ask the instructor to attach it.
   If none turns up, infer from the same term last year, keep working, and say
   which dates are inferred. If the terms differ by more than a week of
   instruction, such as semester to summer, propose a compressed schedule as a
   decision.
3. **Copy.** If the instructor already [copied the course
   instance](https://docs.prairielearn.com/courseInstance/#creating-or-copying-a-course-instance)
   in PrairieLearn, work on that copy; its assessment dates haven't moved.
   Otherwise copy the folder, including `clientFilesCourseInstance`, to one
   named for the new term, give it a new `uuid` and `longName` (assessment
   UUIDs can stay), and remove `shareSourcePublicly`. Convert legacy
   `allowAccess` in `infoCourseInstance.json` as [Migrating from
   `allowAccess`](https://docs.prairielearn.com/courseInstance/#migrating-from-allowaccess)
   describes, including its LTI 1.1 exception and the [institution
   restriction](https://docs.prairielearn.com/courseInstance/#institution-restrictions).
   Keep the [access
   control](https://docs.prairielearn.com/assessment/accessControl/) format
   each assessment has. Folders PrairieLearn doesn't sync come along unchanged;
   mention them.
4. **Plan.** Give every date in the copy the same week of instruction, weekday
   and time in the target term, counting weeks of instruction so breaks don't
   shift what follows. Then check every unusual date, and spot-check each set
   against its pattern (for example, "homework opens Tuesday 08:00 and is due
   the next Tuesday 23:59").
5. **Propose.** Send one message that takes a minute or two to read:
   - the two terms' dates, a line each, with their sources
   - each assessment set's pattern, a line each in a list, not a table
   - a table, one row per assessment in date order: assessment, was (release
     to due), now (release to due), and a note only where something needs a
     look, such as "Due Tuesday: Monday is a holiday". Write dates as "Mon,
     Sep 7", with a time only where it differs from the set's pattern. Show
     each term's breaks, holidays and finals as italic rows, and assessments
     with no dates on one line. Past about 15 assessments, show only the rows
     with notes, and say how many others moved by their set's pattern.
   - the decisions that apply, as a short list, each with your default,
     including the questions named or dated for a past term, by title

   The decisions are the message's last lines. Don't close with a request to
   confirm, a summary, or what you'll do next; the question asks for the
   answer. Then ask one short question, "Anything different
   this term?", with your plan as the recommended answer. Keep the proposal out
   of the question, and don't repeat it afterwards. Apply policy changes as
   rules ("homework due Fridays"), not row by row.

6. **Apply** the plan and the instructor's decisions to the copy. Edit only the
   affected text, so the diff shows just the change.
7. **Verify** every date against the approved proposal and the target calendar:
   no leftover dates, no unapproved deadlines in breaks, no per-student rules.
   Diff the copy against the source: only dates, removed rules, and decisions
   should differ.
8. **Submit for review.** Submit the whole copy in one review when it fits the
   review limits in your instructions; every file in the copy counts. Only a
   copy over the file limit needs more than one review: split it by assessment
   set, and say how many to expect. A file over the size limit can't go through
   review: leave it out and list it for the instructor to upload, rather than
   compressing or splitting it. PrairieLearn
   syncs the course on approval. If the sync reports errors in files you
   changed, fix them and submit again. If they're only in other files, they
   were there before and your changes synced: say so in a sentence, name where
   they are, and stop.

## Handoff

A short list, in plain words:

- **Result:** the new course instance, its dates, and how many dates moved.
- **Calendars:** the sources used, and what was inferred.
- **Decisions:** each one applied.
- **To check in PrairieLearn:** a few assessments' **Access** tabs.
- **Still to do in PrairieLearn:** what lives outside the course files, such as
  PrairieTest exams to create (by assessment name), students to add to labels,
  staff, the enrollment code, and LMS links.
- **Not checked:** anything you couldn't verify.

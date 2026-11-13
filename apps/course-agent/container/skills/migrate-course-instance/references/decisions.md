# Decisions for the review

**The schedule table.** `shift_dates.py report` builds it from `plan.csv`. It
gives one row per assessment, in date order: assessment, ID, current release,
current due date, new release, new due date, and a short note where something
needs a look. Each term's breaks, holidays and finals appear as italic rows. A
note names any difference from last term's pattern, such as a different weekday
or time, or a date moved by hand. It also gives the reason from `plan.csv`'s
`reason` column, so fill that in for every date you change.
Assessments with no dates (PrairieTest-only exams) go on one line. With more
than about 40 assessments, show only the rows that have notes. Run `report` again after each change to `plan.csv`.

`scan` and `plan` report the items below. Include in the review only the ones
that apply, each with its default, and use the instructor's answers.

| Item                                                                                      | Default                                                                                            | Tell the instructor                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Target term has already started (dates come out in the past)                              | Raise it first                                                                                     | They may mean the next term                                                 |
| Deadline on a holiday or in a break                                                       | Move it to the next day of instruction                                                             | Releases there are usually fine                                             |
| Date the script moved out of a break, or flagged as out of order or as shrinking a window | Place it by the set's pattern (a lecture due a week after release)                                 | Which dates you placed by hand                                              |
| Date already outside the source term (a practice quiz still set to 2024)                  | Tie it to the assessment it belongs with. If that assessment has no dates, use the week it covers. | Ask whether the old date was on purpose                                     |
| Finals period shorter in the target term                                                  | Move the dates to the last day of finals                                                           | Ask for the real exam slot                                                  |
| PrairieTest exam UUIDs                                                                    | Leave them; they only grant access during the old exams' reservations                              | List them to replace once the new exams exist                               |
| Exam-mode rule without a PrairieTest exam                                                 | Keep it                                                                                            | Confirm the testing room is still set up                                    |
| Legacy UID rules and per-student overrides                                                | Drop them                                                                                          | What each group was (below), and which assessments would be left staff-only |
| Overrides for a student label (such as a "CA" label)                                      | Keep them, with mapped dates                                                                       | Students must be added to the label again                                   |
| Question named for the old term (`...-fa26`)                                              | Leave it; a migration doesn't edit questions                                                       | List it to replace                                                          |
| Dates in assessment `text` or client files                                                | Update them by hand                                                                                | Which files you changed                                                     |
| Policy changes ("Anything different this term?")                                          | None                                                                                               | Apply any change as a rule across a set                                     |

**Reading UID groups.** `scan` groups legacy UID rules by their set of UIDs
without showing them.

- **A set repeated across most assessments** is usually course staff or CAs.
  Course instance staff permissions replace it.
- **One or two UIDs on a few assessments** are extensions or accommodations.
- **A group that recurs every term** fits a
  [student label](https://docs.prairielearn.com/courseInstance/#student-labels)
  override. Labels need the modern access-control format.

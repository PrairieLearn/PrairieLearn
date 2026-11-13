# Calendars

The script needs one calendar file for the source term and one for the target
term.

```json
{
  "term": "Fall 2026",
  "source": "https://registrar.example.edu/fall-2026-academic-calendar/",
  "instructionBegins": "2026-08-24",
  "instructionEnds": "2026-12-09",
  "holidays": [{ "name": "Labor Day", "date": "2026-09-07" }],
  "breaks": [{ "name": "Fall break", "start": "2026-11-21", "end": "2026-11-29" }],
  "finals": { "start": "2026-12-11", "end": "2026-12-17" },
  "addDeadline": "2026-08-31"
}
```

Only `instructionBegins` is required. With nothing else, the script shifts by
whole weeks and keeps weekdays, ignoring breaks. If the target calendar has
`addDeadline`, it replaces `selfEnrollment.beforeDate`. Put anything the format
can't hold, such as make-up class days, in a `notes` field and in the review.

## Finding them

- Use the registrar's official calendar for both terms, and record its URL.
  Calendars for future terms are often marked tentative; say so.
- A calendar may be a PDF or an image rather than a web page. If you can't
  read it, ask the instructor to attach it.
- One term can span two documents. For example, a spring term whose first weeks
  come before a winter break may list its start only on the fall calendar.
- If no official calendar turns up, ask for the first day of instruction and any
  breaks, but keep working. The same term last year usually starts in the same
  week and has the same breaks. Say which dates you inferred.

## Terms of different lengths

The mapping works week by week of instruction. If the two terms differ by more
than one week of instruction (semester to summer, semester to quarter), it no
longer fits. Say so, propose a compressed schedule, and make it a decision in
the review.

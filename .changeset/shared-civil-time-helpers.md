---
'@prairielearn/utils': minor
---

Add civil date/time parsing with an explicit DST disambiguation policy, start-of-day conversion, and adjacent-date selection to the timezone utilities. Support ISO, compact, US numeric, and common spreadsheet month-name dates, including day-first dates, two-digit years, weekday prefixes, and the `Sept` abbreviation. Interpret inputs in the supplied timezone while ignoring trailing `Z`, `UTC`, and numeric offsets after the time, matching PostgreSQL's civil timestamp behavior.

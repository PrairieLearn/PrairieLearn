---
'@prairielearn/formatter': minor
---

Make `baseDate` optional in `formatDateFriendly` and `formatDateRangeFriendly`. When omitted, relative date labels (today, tomorrow, yesterday) and the 180-day threshold are skipped in favor of absolute dates with year.

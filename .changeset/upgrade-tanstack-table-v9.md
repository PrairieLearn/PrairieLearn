---
'@prairielearn/ui': major
---

Upgrade TanStack Table to v9. Consumers must create tables and column definitions with the exported `useTanstackTable` and `createTanstackTableColumnHelper`, use v9 pinning state (`{ start, end }` instead of `{ left, right }`), and rely on the built-in row selection handler for Shift-range selection instead of `useShiftClickCheckbox`.

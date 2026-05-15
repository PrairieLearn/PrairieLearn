---
'@prairielearn/ui': patch
---

Fix `useShiftClickCheckbox` so shift-click range selection works correctly when the table is sorted or filtered. The hook now tracks the last-clicked row's id and computes the range against the current row-model positions, instead of `row.index` (which is the pre-sort data index).

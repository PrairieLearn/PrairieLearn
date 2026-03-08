---
shaping: true
---

# Access Control UI — Shaping

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Configure who can access an assessment and under what conditions | Core goal |
| R1 | Deadline progression (early bonus, due, late penalty) expressible as a single concept, not N separate rules | Must-have |
| R2 | Post-completion behavior (question/score visibility) is a separate concern from access timing | Must-have |
| R3 | Target rules at groups of students (labels) or individuals, multiple per rule | Must-have |
| R4 | Override rules inherit from base — only specify what's different | Must-have |
| R5 | Rule semantics are explicit: main rule + named overrides, not "highest credit wins" | Must-have |
| R6 | Instructor can understand effective policy for a student | Must-have |
| R7 | Main rule shown as complete picture; overrides shown as compact cards with target + delta | Must-have |
| R8 | Overrides compose by merging in order: all matching rules' overridden fields merge into accumulated result | Must-have |
| R9 | Overrides are easily reorderable via drag-and-drop | Must-have |
| R10 | Editing an override shows only overridden fields, with inherited values as context | Must-have |
| R11 | Summary is the primary view; editing is occasional and doesn't destroy summary context | Must-have |

---

## Selected Shape: D — Summary + drawer

| Part | Mechanism |
|------|-----------|
| **D1** | **Summary page** — Full-width page. Main rule card shows all settings in condensed read-only format (date table, after-complete settings, integrations, etc). Override cards show targets + all overridden fields as condensed values. Not editable inline — edit via drawer. |
| **D2** | **Drag-and-drop reorder** — Overrides reorderable by dragging on summary page. |
| **D3** | **Drawer editing** — Click "edit" opens slide-over drawer (~50-60% width). Summary dimmed but visible behind. |
| **D4** | **Override field pattern** — Inside drawer, inherited fields shown as context (dimmed/dashed). "Override" toggle to activate a field. |
| **D5** | **Target selection** — Inside drawer, chip group with search popover for labels/individuals. |

---

## Fit Check: R x D

| Req | Requirement | D |
|-----|-------------|:-:|
| R0 | Configure who can access an assessment and under what conditions | ✅ |
| R1 | Deadline progression as a single concept | ✅ |
| R2 | Post-completion behavior separate from access timing | ✅ |
| R3 | Target rules at groups of students (labels) or individuals, multiple per rule | ✅ |
| R4 | Override rules inherit from base — only specify what's different | ✅ |
| R5 | Rule semantics are explicit (not "highest credit wins") | ✅ |
| R6 | Instructor can understand effective policy for a student | ✅ |
| R7 | Main rule shown as complete picture; overrides shown as compact cards with target + delta | ✅ |
| R8 | Overrides compose by merging in order | ✅ |
| R9 | Overrides are easily reorderable via drag-and-drop | ✅ |
| R10 | Editing an override shows only overridden fields, with inherited values as context | ✅ |
| R11 | Summary is the primary view; editing is occasional and doesn't destroy summary context | ✅ |

---

## Shapes Considered

### Current + drag-and-drop
Summary cards + separate page for editing. Full-width editing but loses context when navigating away. Rejected: no context while editing (R11).

### C: Split panel (master-detail)
Rule list left, editor right. Always see all rules while editing. Rejected: form squeezed to half width; split panel assumes editing is primary activity, but instructors spend most time in summary.

### E: Tabbed rule editor
Tab per rule, tab bar as overview. Rejected: no summary view showing all rules' deltas at a glance (R7).

### F-hybrid: Section-first summary, rule-first editing
Overrides grouped under their relevant section. Rejected: doesn't support reordering (R9) — overrides scattered across sections have no single list to reorder.

### G: Comparison matrix
Spreadsheet with rows=fields, columns=rules. Rejected: complex fields (deadline arrays) don't fit in cells; not a natural form pattern.

### H: Horizontal kanban
Columns per rule, drag to reorder. Not mutually exclusive with D — could be the summary layout. Not selected as primary shape but could inform D1's card layout.

---

## Slices

### V1: Summary page with read-only cards
- Main rule card showing all settings in condensed read-only format
- Override cards showing targets + all overridden field values
- Data loaded from existing DB tables
- **Demo:** instructor sees the full overview of their access control rules

### V2: Drawer editing for main rule
- Click "edit" on main rule card opens slide-over drawer
- Full form for main rule inside drawer (date control, after-complete, integrations)
- Save persists changes
- **Demo:** instructor edits the main rule without leaving the summary

### V3: Drawer editing for overrides
- Click "edit" on override card opens drawer with override form
- Override field pattern: inherited fields dimmed, "Override" toggle to activate
- Target selection (labels/individuals) inside drawer
- Add new override from summary page
- **Demo:** instructor creates and edits override rules via drawer

### V4: Drag-and-drop reordering
- Drag handles on override cards in summary
- Reorder persists to DB (updates `number` field)
- **Demo:** instructor reorders overrides by dragging
- Independent of V2/V3; can land anytime after V1

### Slice sequence

```
V1 (summary) → V2 (main rule drawer) → V3 (override drawer)
                                         V4 (drag-and-drop, after V1)
```

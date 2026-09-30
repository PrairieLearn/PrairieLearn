# `pl-spreadsheet` element

The `pl-spreadsheet` element provides a local, fixed-structure spreadsheet. Authors
choose the sheets, dimensions, initial cells, and editable ranges. Students can edit
only those ranges; formulas and calculated values are recomputed by PrairieLearn
before `server.py` or an external grader receives the answer.

```html title="question.html"
<pl-spreadsheet
  answers-name="model"
  params-name="workbook"
  aria-label="Budget model"
  height="500px"
></pl-spreadsheet>
```

```python title="server.py"
def generate(data):
    data["params"]["workbook"] = {
        "schema_version": 1,
        "sheets": [
            {
                "name": "Budget",
                "rows": 40,
                "columns": 8,
                "cells": {
                    "A1": "Item",
                    "B1": "Quantity",
                    "C1": "Unit price",
                    "D1": "Total",
                    "D2": "=B2*C2",
                },
                "editable_ranges": ["A2:C40"],
            }
        ],
    }
```

!!! warning

    Values in `data["params"]` are sent to students. Do not put solutions,
    credentials, or other secrets in the workbook template.

## Attributes

| Attribute      | Type     | Default         | Description                                                                                                               |
| -------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `answers-name` | string   | —               | Required. Name of the normalized workbook snapshot in `data["submitted_answers"]`. It must be unique within the question. |
| `params-name`  | string   | —               | Required. Name of the workbook template in `data["params"]`.                                                              |
| `allow-blank`  | boolean  | `false`         | Whether every editable cell may be empty. A cell containing a formula is not empty.                                       |
| `aria-label`   | string   | `"Spreadsheet"` | Accessible name shown in the element header and announced for the grid.                                                   |
| `height`       | CSS size | `"500px"`       | Editor height. Accepts a non-negative number with `px`, `rem`, `em`, `vh`, `vw`, `vmin`, `vmax`, or `%`.                  |

## Workbook template

The template must have `schema_version: 1` and one or more sheets. Sheet names
must be unique without regard to case, at most 31 characters, and may not contain
`\\`, `/`, `*`, `?`, `:`, `[` or `]`.

Each sheet contains:

- `name`: the sheet name.
- `rows` and `columns`: fixed sheet dimensions.
- `cells`: a sparse object mapping A1 addresses to initial inputs.
- `editable_ranges`: an array of A1 ranges. All other cells are read-only.

Cell inputs may be finite numbers, booleans, text, or formulas beginning with `=`.
Students cannot create, delete, or rename sheets; add or remove rows and columns;
change styles; define names; use external workbook references; or import/export XLSX.
Rich formatting is not supported.

## Grading snapshots

`pl-spreadsheet` validates and evaluates the complete workbook before the question's
Python code runs. It does not assign a score. `data["submitted_answers"][answers_name]`
contains a versioned snapshot like this:

```json
{
  "schema_version": 1,
  "template_hash": "…",
  "engine": {
    "name": "hyperformula",
    "version": "3.4.0",
    "configuration_version": 1
  },
  "sheets": [
    {
      "name": "Budget",
      "rows": 40,
      "columns": 8,
      "cells": {
        "D2": {
          "input": { "type": "formula", "value": "=B2*C2" },
          "result": { "type": "number", "value": 24 }
        }
      }
    }
  ]
}
```

The snapshot includes every non-empty cell, including locked template cells. Grade
the typed `input`, the typed `result`, or both. Never trust results supplied by a
browser: PrairieLearn discards them and recomputes from the authoritative template
and sparse editable inputs. The original browser payload remains available through
PrairieLearn's `raw_submitted_answer` storage, while Python and external graders see
only the normalized snapshot.

Historical submissions render their stored snapshot without recalculation. This
makes their displayed results independent of later calculation-engine upgrades.

Formula errors such as division by zero and circular references are valid typed
results with `type: "error"`. Malformed submissions, changed template hashes,
out-of-range or read-only edits, and disallowed formulas produce a format error.

## Formula behavior

Formulas use English function names, `.` for decimals, `,` for argument separators,
cross-sheet A1 references, and a fixed 1899-12-30 date epoch. Supported functions
are:

`ABS`, `AND`, `AVERAGE`, `AVERAGEIF`, `AVERAGEIFS`, `CONCATENATE`, `COS`,
`COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `DATE`, `DAY`, `DAYS`,
`DEGREES`, `EDATE`, `EOMONTH`, `EXP`, `FALSE`, `HLOOKUP`, `IF`, `IFERROR`,
`IFNA`, `INDEX`, `INT`, `ISBLANK`, `ISERROR`, `ISLOGICAL`, `ISNUMBER`,
`ISTEXT`, `LEFT`, `LEN`, `LN`, `LOG`, `LOG10`, `LOWER`, `MATCH`, `MAX`,
`MEDIAN`, `MID`, `MIN`, `MOD`, `MONTH`, `NOT`, `OR`, `PI`, `POWER`, `PRODUCT`,
`RADIANS`, `RIGHT`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SIN`, `SQRT`, `SUM`,
`SUMIF`, `SUMIFS`, `SUMPRODUCT`, `SWITCH`, `TAN`, `TEXT`, `TRIM`, `TRUE`,
`UPPER`, `VALUE`, `VLOOKUP`, `XOR`, and `YEAR`.

Arithmetic and comparison operators are also supported. Volatile functions such as
`RAND`, `RANDBETWEEN`, `NOW`, and `TODAY`, array formulas, named expressions,
external references, and functions outside the list are rejected. See
[HyperFormula's known limitations](https://hyperformula.handsontable.com/docs/guide/known-limitations.html)
for other engine compatibility details.

## Limits

A workbook is limited to 10 sheets, 1,000 rows and 100 columns per sheet, 10,000
total addressable cells, 2,500 populated cells, and 1,000 formulas. Each formula may
contain at most 2 KiB; text and string results may contain at most 32 KiB. Both raw
and normalized submissions are limited to 1 MiB.

## Interaction and saved work

The editor supports keyboard navigation, direct cell and formula-bar editing,
copy/paste, relative-reference fill down/right, and undo/redo. The sheet tabs and
fill controls are keyboard accessible. Editable and read-only cells are
distinguished with text and accessibility state, not color alone. Submission and
manual-grading views use native HTML tables.

With group assessments, saved answers use the ordinary PrairieLearn group
submission. A teammate sees the latest successfully saved spreadsheet after
reloading. Simultaneous editing is not supported; the last successful save wins.

The client bundle uses locally served React Data Grid 7.0.0-beta.61 (MIT) and
HyperFormula 3.4.0 in its GPLv3 mode. It makes no third-party network requests.

## Example implementation

- [element/spreadsheet]

---

[element/spreadsheet]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/spreadsheet

# `pl-spreadsheet` element

The `pl-spreadsheet` element provides a local, fixed-structure spreadsheet. Authors
can construct its sheets in Python or load CSV, TSV, and XLSX source files. Students
can edit only declared ranges; formulas and calculated values are recomputed by
PrairieLearn before `server.py` or an external grader receives the answer.

```html title="question.html"
<pl-spreadsheet
  answers-name="model"
  params-name="workbook"
  aria-label="Budget model"
  height="500px"
></pl-spreadsheet>
```

```python title="server.py"
import prairielearn.spreadsheet_utils as psp


def generate(data):
    data["params"]["workbook"] = psp.create_spreadsheet({
        "Budget": {
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
    })
```

!!! warning

    Values in `data["params"]` are sent to students. Do not put solutions,
    credentials, or other secrets in the workbook template.

## Attributes

| Attribute      | Type     | Default         | Description                                                                                                               |
| -------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `answers-name` | string   | —               | Required. Name of the normalized workbook snapshot in `data["submitted_answers"]`. It must be unique within the question. |
| `params-name`  | string   | —               | Name of the workbook template in `data["params"]`. Omit it when using `pl-spreadsheet-data` children.                     |
| `allow-blank`  | boolean  | `false`         | Whether every editable cell may be empty. A cell containing a formula is not empty.                                       |
| `aria-label`   | string   | `"Spreadsheet"` | Accessible name shown in the element header and announced for the grid.                                                   |
| `height`       | CSS size | `"500px"`       | Editor height. Accepts a non-negative number with `px`, `rem`, `em`, `vh`, `vw`, `vmin`, `vmax`, or `%`.                  |

## Workbook template

Exactly one source mode is required: either set `params-name` with no child
declarations, or add one or more `pl-spreadsheet-data` children without
`params-name`.

The template must have `schema_version: 2` and one or more sheets. Sheet names must
be unique without regard to case, contain 1 to 31 Unicode characters, and have no
leading or trailing whitespace. They may not contain `!`, `:`, `<`, `>`, `{`, `}`,
`[`, `]`, or the null character (`\0`). All other Unicode characters are allowed.

Each Python-defined sheet contains:

- `name`: the sheet name.
- `rows` and `columns`: fixed sheet dimensions.
- `cells`: a sparse object mapping A1 addresses to initial inputs.
- `editable_ranges`: an array of A1 ranges. All other cells are read-only.
- `student_range`: an optional contiguous A1 range. Only this range is rendered,
  accepted in submissions, and exposed to grading code. If omitted, the complete
  `A1:<last-cell>` sheet is visible.

Template addresses use source-workbook coordinates. PrairieLearn rebases each
`student_range` into a student-local address space whose top-left cell is `A1`.
For example, an authored range `C5:F20` is displayed and submitted as `A1:D16`;
an authored formula `=C5*D5` becomes `=A1*B1`. The formula bar, row and column
headings, fill behavior, normalized snapshots, and Python grading APIs all use
these student-local addresses. The element's browser configuration and normalized
snapshot do not contain the source mapping. File-backed mappings remain private;
the original object selected by `params-name` is still part of student-visible
`data["params"]`, as noted above.

Cell inputs may be finite numbers, booleans, text, or formulas beginning with `=`.
Students cannot create, delete, or rename sheets; add or remove rows and columns;
change styles; define names; use external workbook references; or import/export XLSX.
Rich formatting is not supported.

## File sources and private grading cells

Place source files in the question directory (the default) or in
`serverFilesCourse`. Source files are read only while PrairieLearn generates the
variant; they are never sent to the browser.

```html title="question.html"
<pl-spreadsheet answers-name="model" aria-label="Budget model">
  <pl-spreadsheet-data
    source-file="workbook.csv"
    sheet-name="Inputs"
    student-range="A1:D100"
    editable-ranges="B2:D100"
  ></pl-spreadsheet-data>
  <pl-spreadsheet-output
    name="score"
    sheet-name="Inputs"
    cell="E2"
    required="true"
  ></pl-spreadsheet-output>
</pl-spreadsheet>
```

`pl-spreadsheet-data` has these attributes:

| Attribute         | Required | Description                                                                                                   |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `source-file`     | yes      | Relative `.csv`, `.tsv`, or `.xlsx` path. Absolute paths and traversal outside the selected root are invalid. |
| `sheet-name`      | yes      | Assigns the CSV/TSV sheet name or selects an exact XLSX worksheet name.                                       |
| `student-range`   | yes      | Contiguous A1 range that forms the hard visibility and formula-reference boundary.                            |
| `editable-ranges` | no       | Comma-separated ranges contained by `student-range`. The default is read-only.                                |
| `directory`       | no       | `.` (the question directory) or `serverFilesCourse`; defaults to `.`.                                         |

CSV and TSV sources contain one sheet and may be declared once. For XLSX files,
repeat `pl-spreadsheet-data` for every worksheet students should see. PrairieLearn
reads each workbook once and retains undeclared worksheets only in the private
grading copy. Sheet names from all sources must be unique without regard to case.

Each `pl-spreadsheet-output` allowlists one result that may leave the private
workbook. Its required `name`, `sheet-name`, and `cell` attributes identify the
output; `required="true"` rejects an empty or error result. An output may reference
a visible cell, a hidden cell, or an undeclared XLSX worksheet. Only the typed named
result enters the normalized answer.

The complete source workbook is authoritative during grading. PrairieLearn clears
each `student-range`, connects it to a private student-local mirror, overlays the
normalized public template and student changes (including explicitly cleared
cells), adds manually configured private sheets, and then recalculates the named
outputs. Student formulas execute only in the local mirror; controlled bridge cells
carry their results into the authoritative source workbook. A hidden source formula
may reference visible or hidden cells. A visible formula may reference only cells
inside the union of declared student ranges; direct, transitive, cross-sheet,
whole-row, and whole-column references that escape that boundary are rejected both
when the variant is generated and when a submission is normalized.

File ingest imports cell values and formulas, not XLSX styles, merged cells,
comments, charts, or macros.

## Python authoring and ingest helpers

The public `prairielearn` Python library exposes:

```python
import prairielearn.spreadsheet_utils as psp


template = psp.create_spreadsheet({
    "Inputs": {
        "cells": {"A1": "Quantity", "B2": 3},
        "rows": 20,
        "columns": 4,
        "editable_ranges": ("B2:D20",),
    },
    # A direct address-to-value mapping infers the smallest sheet dimensions.
    "Summary": {"A1": "=SUM(Inputs!B2:B20)"},
})

sheet = psp.dataframe_to_spreadsheet_sheet(
    dataframe,
    name="Inputs",
    start_cell="C5",
    include_columns=False,
    include_index=False,
    editable_ranges=("C5:F20",),
)
book = psp.dataframes_to_spreadsheet_book({"Inputs": dataframe})

book = psp.read_spreadsheet("workbook.xlsx")
csv_book = psp.read_spreadsheet_csv("workbook.csv", sheet_name="Inputs")
tsv_book = psp.read_spreadsheet_tsv("workbook.tsv", sheet_name="Inputs")
xlsx_book = psp.read_spreadsheet_xlsx("workbook.xlsx")
```

`psp.create_spreadsheet()` returns a versioned `psp.Definition` accepted by
`data["params"]`. Each sheet may be a direct address-to-value mapping or a
`psp.SheetSpec` with optional `cells`, `rows`, `columns`, `editable_ranges`, and
`student_range`. It infers omitted dimensions, defaults omitted cells and editable
ranges to empty, and omits optional fields whose defaults apply. Pass a non-empty
`outputs` mapping to return a `psp.GradingBook` suitable for
`data["correct_answers"]`. Each output may be a qualified address string such as
`"Checks!A1"`, or a mapping whose `cell` is either qualified or paired with a
separate `sheet`. Output `required` defaults to `False`.

These authoring definitions are distinct from `psp.Snapshot`, the evaluated,
hash-bound submission that PrairieLearn creates after calculation. Authoring code
should use `psp.create_spreadsheet()` rather than writing schema versions directly.

The ingest helpers also return plain dictionaries in the versioned sheet/book
schema. By default, `dataframe.iloc[0, 0]` maps to `A1`; column and index labels
are opt-in.
`None`, `NaN`, `NaT`, and `pd.NA` are omitted, NumPy scalar values become Python
scalars, and strings beginning with `=` remain formulas. Non-finite numbers,
date/time values, complex values, nested objects, and requested multi-index labels
raise an actionable exception. CSV and TSV are read headerless without automatic
NA conversion. XLSX formulas are loaded as formulas. The same workbook, formula,
text, and payload limits apply after ingest.

The module is designed to be imported as `psp`. Its most frequently used JSON
types are the concise unions `psp.Input`, `psp.Result`, and `psp.Value`, with
concrete variants such as `psp.NumberInput`, `psp.FormulaInput`, and
`psp.ErrorResult`. `psp.Snapshot`, `psp.SnapshotCell`, `psp.SourceBook`, and
`psp.SourceSheet` describe the complete persisted and ingest structures.

`psp.Address`, `psp.AddressRange`, `psp.QualifiedAddress`,
`psp.QualifiedAddressRange`, `psp.AddressSpace`, and `psp.AddressSpaceMap` are
public immutable coordinate types. Ranges support A1 parsing, containment, and
intersection. Address spaces provide checked source-to-student and
student-to-source conversion for cells and ranges. `psp.rebase_spreadsheet_formula()`
rewrites source-coordinate formula references into the corresponding student-local
address spaces and rejects references outside those spaces.

## Grading snapshots

`pl-spreadsheet` validates and evaluates the complete workbook before the question's
Python code runs. It does not assign a score. `data["submitted_answers"][answers_name]`
contains a versioned snapshot like this:

```json
{
  "schema_version": 2,
  "template_hash": "…",
  "engine": {
    "name": "hyperformula",
    "version": "3.4.0",
    "configuration_version": 2
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

## Private grading workbook

To calculate question-specific grading evidence, define a private workbook in
`data["correct_answers"][answers_name]`. PrairieLearn imports all student sheets
from that element under their original names, adds the private sheets in a separate
calculation engine, and stores only the named outputs:

```python title="server.py"
import prairielearn.spreadsheet_utils as psp


def generate(data):
    # Define data["params"]["workbook"] as above.
    data["correct_answers"]["model"] = psp.create_spreadsheet(
        {
            "Checks": {
                "A1": "=Budget!D2",
                "A2": "=A1=24",
            }
        },
        outputs={
            "total": {"cell": "Checks!A1", "required": True},
            "total_is_correct": "Checks!A2",
        },
    )
```

Private sheets may reference student sheets and other private sheets, but cannot
replace student cells or reuse a student sheet name. They use the same sheet-name
and formula policies and independently receive the workbook limits below. A private
workbook may export at most 100 named outputs.

Private sheet formulas and `pl-spreadsheet-output` declarations use authoritative
source-workbook coordinates. Grading code that reads the normalized student
snapshot uses A1-based student-local coordinates. `psp.AddressSpace` can translate
between those two coordinate systems when a rubric needs both.

Each output may set `"required": True` to reject the submission during parsing
when that output evaluates to a typed `empty` or `error` result. The option
defaults to `False`; numeric zero, `False`, and string values are not empty.

The private workbook definition is server-owned and is not included in the editor,
submission display, or normalized answer. The answer contains only its hash and
typed outputs:

```json
{
  "grading": {
    "schema_version": 2,
    "grader_hash": "…",
    "outputs": {
      "total": { "type": "number", "value": 24 },
      "total_is_correct": { "type": "boolean", "value": true }
    }
  }
}
```

Calculation errors in private sheets are preserved as typed error outputs so that
question-specific grading code can decide what they mean. Invalid private workbook
configuration is an authoring error.

### Grading in `server.py`

`pl-spreadsheet` does not assign a score. Wrap the submitted snapshot with
`psp.Book` to inspect cells and private outputs, then set `score` or
`partial_scores` in the question's `grade()` function:

```python title="server.py"
import prairielearn as pl
import prairielearn.spreadsheet_utils as psp


def grade(data):
    workbook = psp.Book(data["submitted_answers"]["model"])
    budget = workbook["Budget"]
    formula_cell = budget.cell("D2")

    checks = [
        formula_cell.formula == "=B2*C2",  # Exact-text grading when required.
        formula_cell.matches_formula("=B2*C2", structural=True),
        formula_cell.value == 24,
        workbook.outputs["total"].value == 24,
    ]
    data["partial_scores"]["model"] = {
        "score": sum(checks) / len(checks),
        "weight": 1,
    }
    pl.set_weighted_score_data(data)
```

Use `sheet.cell("D2")` or `sheet.range("A2:D9")` when the expected return type is
known. `workbook["Budget"]` returns a read-only `psp.Sheet`; indexing that sheet
remains available when either cell or range is acceptable. A sheet retains its
parent workbook, so a qualified reference such as
`summary.range("Budget!A2:D9")` resolves to the `Budget` sheet.
Excel-style quoted names and escaped apostrophes are supported, for example
`sheet["'Input Data'!A2:D9"]` and `sheet["'Bob''s Data'!A1"]`.

The corresponding view types are `psp.Cell`, `psp.CellRange`, and `psp.Output`.

Cell views expose `input`, `result`, `value`, `formula`, and `formula_ast`, together
with `is_empty`, `is_formula`, `is_error`, `error_type`, and `error_value`. Output
views expose the same result-state properties. Spreadsheet calculation errors are
normal result states: `value` is `None` for both empty and error results, while
`is_empty`, `is_error`, and the error properties distinguish them. Range views
provide rectangular `inputs`, `results`, `values`, and `formulas` projections,
row-major iteration, and predicate-based `query()` methods. The views are read-only
and do not recalculate the snapshot.

`shape`, iteration, `query()`, cell lookup, and range lookup all use the A1-based
student-local address space. Source-workbook addresses are intentionally absent
from the normalized snapshot; use the public address-space helpers only when
authoring or grading code must relate local cells back to a known source range.

The functional API remains available for lower-level access:
`psp.get_spreadsheet_cell()` returns the complete typed cell,
`psp.get_spreadsheet_result()` returns its typed result,
`psp.get_spreadsheet_value()` returns a scalar or `None` for an empty or error
result, and `psp.get_spreadsheet_grading_output()` returns a typed private output. Invalid
references and malformed snapshots still raise exceptions because they indicate a
grading-code or internal-data error rather than a student calculation result.

Formula ASTs have their own `schema_version`. They normalize function names and
operators while preserving grouping, sheet names, ranges, and absolute-reference
flags. HyperFormula remains authoritative for validation and calculation; the AST
is an inspection tool for question-defined structural grading. Structural
`matches_formula()` calls return `False` when the student's formula cannot be
represented by the AST, while an invalid expected formula raises
`psp.FormulaParseError`.

`psp.parse_spreadsheet_formula()` returns a frozen, slot-based `psp.FormulaAst` dataclass
with `schema_version`, the exact original `formula`, and a `root` node. Access these
with attributes such as `ast.formula` and `ast.root`. Nodes form this discriminated
union of frozen dataclasses:

| Node `type` | Fields                                                               |
| ----------- | -------------------------------------------------------------------- |
| `literal`   | `value_type` (`number`, `string`, `boolean`, or `error`) and `value` |
| `reference` | `reference`, an endpoint described below                             |
| `range`     | `start` and `end` reference endpoints                                |
| `function`  | uppercase `name` and ordered `arguments`                             |
| `unary`     | `operator` (`+` or `-`) and `operand`                                |
| `postfix`   | `operator` (`%`) and `operand`                                       |
| `binary`    | normalized `operator`, `left`, and `right`                           |
| `group`     | grouped `expression`                                                 |
| `empty`     | no additional fields; represents an omitted function argument        |

A reference endpoint is a typed union discriminated by `kind`:

| Endpoint `kind` | Required fields                                                 |
| --------------- | --------------------------------------------------------------- |
| `cell`          | `sheet`, `column`, `row`, `column_absolute`, and `row_absolute` |
| `column`        | `sheet`, `column`, and `column_absolute`                        |
| `row`           | `sheet`, `row`, and `row_absolute`                              |

`sheet` is a decoded sheet name or `None`. Range nodes are likewise typed as cell,
column, or row ranges, with `start` and `end` guaranteed to have the same endpoint
kind. Graders can compare immutable nodes directly or inspect only the attributes
relevant to the rubric. The AST is constructed on demand in Python; it is not part
of the transported or persisted spreadsheet snapshot. A future AST shape change
will use a new schema version.

External graders receive the same object at
`data["submitted_answers"][answers_name]` in `/grade/data/data.json`. They may read
the documented JSON directly, including exact formula inputs and named private
outputs.

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
and normalized submissions are limited to 1 MiB. A private grading workbook has an
independent copy of these limits; only its named outputs count toward the normalized
submission payload.

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

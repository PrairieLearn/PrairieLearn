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
| `weight`       | integer  | 1               | Weight of this element's score when it grades against a [reference solution](#hidden-test-cases-and-reference-solutions). |

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

Like Google Sheets, an author-facing range may leave an endpoint open-ended by
omitting its row or column: `B2:B` runs from `B2` to the last row, `A:C` covers
every row of columns A to C, and `3:5` covers every column of rows 3 to 5. A
`student_range` extends to the edge of the sheet, and editable ranges and
parameters extend to the edge of the sheet's student range. Open-ended ranges are
resolved when the variant is generated; student formulas still use closed ranges.

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
| `student-range`   | yes      | Contiguous A1 range that forms the hard visibility and formula-reference boundary. May be open-ended.         |
| `editable-ranges` | no       | Comma-separated ranges contained by `student-range`, which may be open-ended. The default is read-only.       |
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
student-to-source conversion for cells and ranges. Pass `bounds=` to
`psp.AddressRange.from_a1()` to resolve an open-ended range such as `B2:B`.
`psp.rebase_spreadsheet_formula()` rewrites source-coordinate formula references
into the corresponding student-local address spaces and rejects references outside
those spaces.

`psp.fill_formula()` repeats a formula across a range the way a spreadsheet's fill
handle does, so one formula can describe a whole column of answers:

```python
psp.fill_formula("Forecast!D4:D6", "=ABS(B4-C4)")
# {"Forecast!D4": "=ABS(B4-C4)", "Forecast!D5": "=ABS(B5-C5)", "Forecast!D6": "=ABS(B6-C6)"}

psp.fill_formula("D2:E2", "=ABS(B2-$C1)")
# {"D2": "=ABS(B2-$C1)", "E2": "=ABS(C2-$C1)"}
```

The formula is written for the first cell of the range. Each other cell receives it
with relative references moved by that cell's offset, while `$`-anchored rows and
columns stay fixed. Pass `origin="E2"` to write the formula for a different cell,
such as the last one when filling up or left. Keys are sheet-qualified when the
range is, so the result can be merged into a `reference` mapping, or used as a
sheet's `cells` otherwise. `psp.shift_formula(formula, rows=..., columns=...)`
moves a single formula. A reference that would move above row 1 or left of column A
raises `ValueError`.

## Grading snapshots

`pl-spreadsheet` validates and evaluates the complete workbook before the question's
Python code runs. It assigns a score only when the question defines a
[reference solution](#hidden-test-cases-and-reference-solutions).
`data["submitted_answers"][answers_name]` contains a versioned snapshot like this:

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
replace student cells or reuse a student sheet name. (Hidden test cases, described
below, temporarily override declared parameter cells.) They use the same sheet-name
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

Without a reference solution, `pl-spreadsheet` does not assign a score. Wrap the
submitted snapshot with `psp.Book` to inspect cells and private outputs, then set
`score` or `partial_scores` in the question's `grade()` function:

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
known. Ranges may be open-ended, so `sheet.range("D2:D")` runs to the last row of
the student's sheet. `workbook["Budget"]` returns a read-only `psp.Sheet`; indexing
that sheet remains available when either cell or range is acceptable. A sheet
retains its parent workbook, so a qualified reference such as
`summary.range("Budget!A2:D9")` resolves to the `Budget` sheet. Excel-style quoted
names and escaped apostrophes are supported, for example `sheet["'Input
Data'!A2:D9"]` and `sheet["'Bob''s Data'!A1"]`.

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

## Hidden test cases and reference solutions

A private workbook evaluated only on the student's own inputs cannot tell `=B2*C2`
from a typed `12`. Hidden test cases recalculate the workbook with different
parameter values, and a reference solution supplies the expected formula for each
editable answer cell. PrairieLearn evaluates the student's workbook and the reference
workbook on the submitted inputs and on every test case, then stores typed
comparisons.

```python title="server.py"
import prairielearn.spreadsheet_utils as psp


def generate(data):
    # Define data["params"]["workbook"] with editable cells in Order!C2:C3.
    data["correct_answers"]["model"] = psp.create_spreadsheet(
        {"Checks": {"A1": "=SUM(Order!C2:C3)"}},
        outputs={"grand_total": "Checks!A1"},
        test_cases=[
            {"name": "zero quantity", "inputs": {"Order!A2": 0}},
            *psp.random_cases(10, {"Order!A2": (1, 20), "Order!B2": (0.5, 99.5)}),
        ],
        reference={
            "Order!C2": "=A2*B2",
            "Order!C3": {"value": "=A3*B3", "rtol": 1e-6},
        },
    )


def grade(data):
    workbook = psp.Book(
        data["submitted_answers"]["model"],
        grading=data["correct_answers"]["model"],
    )
    total = workbook.reference["Order!C2"]
    if not total.all_match and (mismatch := total.first_mismatch) and mismatch.case:
        data["feedback"]["model"] = (
            f"Your total is {mismatch.student_value} when the inputs are "
            f"{mismatch.case.inputs}; expected {mismatch.reference_value}."
        )
    data["score"] = workbook.reference.score()
```

Most reference-graded questions need only a reference solution and test cases, and
no `grade()` function at all. Private sheets and outputs may then be omitted, and
`psp.fill_formula()` writes a column of reference formulas from the first one:

```python title="server.py"
def generate(data):
    # Define data["params"]["workbook"] with editable cells in Order!C2:C7.
    data["correct_answers"]["model"] = psp.create_spreadsheet(
        test_cases=psp.random_cases(10, {"Order!A2": (1, 20), "Order!B2": (0.5, 99.5)}),
        reference=psp.fill_formula("Order!C2:C7", "=A2*B2"),
        rtol=0,
        atol=1e-6,
    )
```

When a reference solution is defined, `pl-spreadsheet` grades the answer itself.
Each reference cell earns equal credit when it matches the reference on the
submitted inputs and on every test case, and the element's partial score uses its
`weight` attribute. The feedback names the first mismatching cell, in the student's
coordinates, and says whether it calculates the wrong value, uses a typed value that
does not change with the test cases, or uses a formula that does not generalize.
`pl-spreadsheet` shows the feedback and a score badge with the submission, and
highlights each mismatching reference cell in red. A
question's `grade()` function runs afterward, so it may replace this partial score,
as in the custom rubric above, or set `data["score"]` directly.

The element's `test()` submits the reference solution as a correct answer and text
that matches no reference result as an incorrect one. Without a reference solution,
it submits the workbook's starting values, so formulas and required outputs evaluate
as they do in the unedited workbook. If the question's `grade()` function changes
the score or grades other cells, add a `test()` function to `server.py` that edits
`data["raw_submitted_answers"]` and sets the expected `partial_scores` or `score`.

Every address uses authoritative source-workbook coordinates, like private sheets
and outputs.

- **Test cases** override cells, recalculate, read every named output, and then
  restore the original contents before the next case. A case may override locked
  constant cells, cells outside the student range in a source sheet, and editable
  cells declared in `parameters`. Cells where students enter formulas are never
  overridden. Override values must be constants (`None` clears a cell). A workbook
  may define at most 50 test cases with at most 100 inputs each.
- **`psp.random_cases(count, inputs)`** generates cases from Python's `random`
  module, which PrairieLearn seeds for each variant. Each input is a `(low, high)`
  tuple (`randint` for two integers, otherwise `uniform`), any other non-string
  sequence (`choice`), or a zero-argument callable.
- **`parameters`** lists editable ranges that hold inputs rather than answers, such
  as `["Order!A2:A20"]`. The reference workbook keeps the student's values in these
  cells, and test cases may override them.
- **`reference`** maps each editable answer cell to a formula or constant. Reference
  formulas follow the same function policy and student-range boundary as student
  formulas, so a student can always write an equivalent formula. They are evaluated
  exactly as if they were submitted. A reference that fails validation is an
  authoring error. Calculation errors in reference results, such as `#DIV/0!` for a
  zero quantity, are compared like any other result.
- **Matching** is typed. Numbers match when
  `abs(student - reference) <= atol + rtol * abs(reference)`, with defaults of
  `rtol=1e-2` and `atol=1e-8` (like `pl-number-input`). Set `rtol`, `atol`, or both
  per cell, or for the whole reference with the `rtol` and `atol` keyword arguments
  of `create_spreadsheet()`. Strings and booleans must match exactly, errors match by
  error type, and empty matches only empty. Pass `compare_outputs=True` to also
  compare every named output between the two workbooks.

When a variant is created, PrairieLearn also evaluates the reference workbook on the
template (keeping any template values in parameter cells) and stores the result with
the private grading workbook. The answer panel renders that workbook read-only, with
the reference cells highlighted and the same values/formulas toggle as submitted
answers. It is shown only when the question's correct answer is visible. A reference
solution that cannot be evaluated is reported as a question error when the variant
is created. Without a reference solution, the answer panel explains that grading is
defined by the question.

With a reference solution, `outputs` and the private sheets may be omitted.
Reference formulas, test-case inputs, and parameter declarations never leave the
server. The normalized answer adds only the recalculated outputs, the typed
comparisons, and a summary:

```json
{
  "grading": {
    "schema_version": 2,
    "grader_hash": "…",
    "outputs": { "grand_total": { "type": "number", "value": 33.5 } },
    "cases": [
      {
        "name": "zero quantity",
        "outputs": { "grand_total": { "type": "number", "value": 20 } }
      }
    ],
    "reference": {
      "cells": {
        "Order!C2": {
          "base": {
            "student": { "type": "number", "value": 13.5 },
            "reference": { "type": "number", "value": 13.5 },
            "match": true
          },
          "cases": [
            {
              "student": { "type": "number", "value": 13.5 },
              "reference": { "type": "number", "value": 0 },
              "match": false
            }
          ]
        }
      },
      "summary": { "matched": 1, "total": 2 }
    }
  }
}
```

`psp.Book` exposes these as `workbook.cases` (each `psp.Case` has a `name`,
typed `outputs`, and `value(output_name)`) and `workbook.reference`, a mapping from
source address to `psp.ComparisonSeries`. A series provides `base`, `cases`,
`all_match`, `match_rate`, and `first_mismatch`. Each `psp.Comparison` provides
typed `student` and `reference` results, `student_value`, `reference_value`,
`match`, and the `case` that produced it (`None` for the submitted inputs).
`workbook.reference.outputs` holds output comparisons.
`workbook.reference.score()` returns the fraction of all comparisons that match, and
`workbook.reference.cell_score()` returns the fraction of reference cells that match
in every run. Pass `grading=data["correct_answers"][answers_name]` to also populate
each case's `inputs` and to enable `workbook.student_cell(source_address)`, which
returns the cell a student sees for a source address such as a reference key.
PrairieLearn verifies that its `grader_hash` matches the snapshot.

File-backed questions can declare reference cells and parameters in HTML:

```html title="question.html"
<pl-spreadsheet answers-name="model">
  <pl-spreadsheet-data
    source-file="order.csv"
    sheet-name="Order"
    student-range="A1:C3"
    editable-ranges="C2:C3"
  ></pl-spreadsheet-data>
  <pl-spreadsheet-reference
    sheet-name="Order"
    cell="C2"
    formula="=A2*B2"
  ></pl-spreadsheet-reference>
  <pl-spreadsheet-reference
    sheet-name="Order"
    cell="C3"
    formula="=A3*B3"
    rtol="1e-6"
  ></pl-spreadsheet-reference>
</pl-spreadsheet>
```

| Element                    | Attribute    | Required | Description                                                                   |
| -------------------------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `pl-spreadsheet-reference` | `sheet-name` | yes      | Source sheet containing the editable answer cell.                             |
|                            | `cell`       | yes      | Source-coordinate address of the answer cell.                                 |
|                            | `formula`    | yes      | Reference formula in source coordinates.                                      |
|                            | `rtol`       | no       | Relative tolerance for numbers; defaults to `1e-2`.                           |
|                            | `atol`       | no       | Absolute tolerance for numbers; defaults to `1e-8`.                           |
| `pl-spreadsheet-parameter` | `sheet-name` | yes      | Source sheet containing the editable input cells.                             |
|                            | `range`      | yes      | Source-coordinate range of editable parameter cells, which may be open-ended. |

These children also work with `params-name`, and they merge with any `reference` or
`parameters` set in `data["correct_answers"]`. Test cases are authored only in
Python.

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
independent copy of these limits; only its named outputs, test-case outputs, and
reference comparisons count toward the normalized submission payload. A workbook may
define at most 50 test cases, 100 parameter ranges, and 500 reference cells, and may
export at most 5,000 results. Each output counts once per run and each comparison
counts twice, across the submitted inputs and every test case.

## Interaction and saved work

Single-clicking a cell selects it. All editing happens in the formula bar: start
typing in a selected cell to replace its contents, or double-click it or press F2 to
edit its existing contents, and the formula bar takes focus with a brief blue outline.
Enter saves and moves down, and Tab saves and moves right (Shift reverses either);
Escape discards the edit. Delete or Backspace clears a selected cell. While a cell is
being edited, it and every cell that depends on it show their values as the student
types, and a line below the formula bar describes any error in the selected cell's
value. The editor also supports keyboard navigation, copy/paste,
relative-reference fill (with the fill down/right buttons, or by dragging a cell's
corner handle up, down, left, or right along its row or column), and undo/redo.
The sheet tabs and fill controls are keyboard accessible. Editable and read-only
cells are distinguished with text and accessibility state, not color alone.
Submission and manual-grading views use native HTML tables. These tables show
calculated values by default and provide a Values/Formulas switch for viewing every
cell's original input.

The formula bar colors formulas as students type, giving each distinct cell
reference its own color and outlining the referenced cells in the grid in the same
color. Typing a function name lists matching supported functions, which can be
chosen with the arrow keys and Enter or Tab. Inside a function call, a hint shows
its arguments with the current one in bold. Wherever a formula expects a value, such
as after `=`, `(`, `,`, or an operator, clicking a cell or dragging across cells
inserts a reference, as in Google Sheets or Excel. Right after pointing, the arrow
keys move the reference and Shift with the arrow keys resizes it; once the student
types, the arrow keys move the cursor in the formula bar as usual.

The formula bar also draws the structure of a formula as interlocking tiles, in the
style of the [tylr](https://tylr.fun) structure editor. Values have pointed ends,
operators have notched ends that values slot into, and a function call is split into
shards (`SUM(`, `,`, `)`) that interlock with its arguments; each kind of tile has its
own color, and the shards of the call containing the cursor are highlighted together.
Missing parts appear as hollow, dashed holes shaped like what belongs in them, with
argument names inside: a missing argument or value, a missing operator between two
values, or a missing closing parenthesis. A parenthesized group also offers an
optional function-name hole before its `(`, which turns the group into a function
call when filled. Deleting an operator or a `)` leaves a hole
where it was rather than changing what the rest of the formula means. Tab and
Shift+Tab move between holes. Entering a formula closes any parentheses left open at
its end and announces anything still missing, such as "SUMIF is missing criteria."

The editor displays spreadsheet errors such as `#DIV/0!`, `#CYCLE!`, `#REF!`, and
`#ERROR!` in their cells while retaining the entered formula in the formula bar.
Save and Grade includes the latest text even if the formula bar is still being
edited. Formulas rejected by PrairieLearn's formula or reference policies remain
format errors and are not graded, but their raw text is retained so the student can
correct it after saving or reloading.

With group assessments, saved answers use the ordinary PrairieLearn group
submission. A teammate sees the latest successfully saved spreadsheet after
reloading. Simultaneous editing is not supported; the last successful save wins.

The client bundle uses locally served React Data Grid 7.0.0-beta.61 (MIT) and
HyperFormula 3.4.0 in its GPLv3 mode. It makes no third-party network requests.

## Example implementation

- [element/spreadsheet]

---

[element/spreadsheet]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/spreadsheet

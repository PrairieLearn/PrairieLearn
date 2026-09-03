# `pl-big-operator-input` element

Displays an indexed operator expression, such as a sum, integral, or limit. Students enter the limits and body in separate fields, and PrairieLearn stores them as one combined answer.

The fields accept the same symbolic syntax as [`pl-symbolic-input`](pl-symbolic-input.md).

## Sample element

```html title="question.html"
<pl-big-operator-input
  answers-name="total"
  correct-answer="Sum(k**2, (k, 1, n))"
  variables="n"
></pl-big-operator-input>
```

Because `correct-answer` contains the complete expression, the element can infer the operator, index variable, and limits layout.

## Customizations

| Attribute                     | Type                                                                                                                            | Default        | Description                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-complex`               | boolean                                                                                                                         | false          | Whether to allow complex numbers. Students may use `i` or `j` as the imaginary unit.                                                                                         |
| `allow-limit-direction-input` | boolean                                                                                                                         | true           | Whether students choose the direction of an approach limit. When `false`, the configured `limit-direction` is fixed. This attribute is only valid with approach limits.      |
| `allowed-blank`               | `"none"`, `"limits"`, `"body"`, or `"all"`                                                                                      | `"none"`       | Which parts of the answer students may leave blank.                                                                                                                          |
| `answers-name`                | string                                                                                                                          | —              | Name used to store the combined answer. This value must be unique within a question.                                                                                         |
| `body-relative-weight`        | integer                                                                                                                         | 3              | Weight of the body when `grading-method="component"`. Each limit field has a weight of 1.                                                                                    |
| `body-size`                   | integer                                                                                                                         | 16             | Positive character width of the body field.                                                                                                                                  |
| `correct-answer`              | string                                                                                                                          | —              | Correct answer as a complete, parseable expression. When possible, the element infers the operator, index variable, limits layout, and limit direction from this expression. |
| `custom-functions`            | string                                                                                                                          | —              | Comma-separated list of symbolic function names allowed in correct answers and student answers, such as `"f,g"`.                                                             |
| `grading-method`              | `"exact"`, `"component"`, or `"equivalent"`                                                                                     | `"equivalent"` | How to compare the student answer with the correct answer. See [Grading](#grading).                                                                                          |
| `index-variable`              | string                                                                                                                          | —              | Bound variable, which is automatically allowed in the body. Required when the element cannot infer it from `correct-answer`.                                                 |
| `limit-direction`             | `"two-sided"`, `"from-left"`, or `"from-right"`                                                                                 | `"two-sided"`  | Direction of an approach limit. When possible, the element infers this value from `correct-answer`.                                                                          |
| `limit-size`                  | integer                                                                                                                         | 7 or 10        | Positive character width of each limit field. The default is 7 for bounds and 10 for domain or approach limits.                                                              |
| `limits`                      | `"auto"`, `"bounds"`, `"domain"`, or `"approach"`                                                                               | `"auto"`       | Limits layout to display. `auto` first tries to infer the layout from `correct-answer`, then uses the operator's default layout shown below.                                 |
| `operator`                    | `"sum"`, `"product"`, `"integral"`, `"limit"`, `"union"`, `"intersection"`, `"disjoint-union"`, `"min"`, `"max"`, or `"custom"` | —              | Operator to display and grade. Required when the element cannot infer it from `correct-answer`. Use `custom` for a custom LaTeX operator.                                    |
| `operator-latex`              | string                                                                                                                          | —              | LaTeX used to display the operator. Required for custom operators; overrides the default symbol for built-in operators.                                                      |
| `show-help-text`              | boolean                                                                                                                         | true           | Whether to show symbolic-input help beside the body field.                                                                                                                   |
| `variables`                   | string                                                                                                                          | —              | Comma-separated list of allowed symbols in addition to the index variable, such as `"Gamma,k,N"`.                                                                            |
| `weight`                      | integer                                                                                                                         | 1              | Weight used when computing a weighted average score across elements.                                                                                                         |

## Operators and limits

The `limits` attribute controls which fields appear:

- `bounds` displays a lower bound, an upper bound, and a body.
- `domain` displays a domain and a body.
- `approach` displays a target value and a body.

With `limits="auto"`, the element first tries to infer the layout from `correct-answer`. If it cannot, the element uses the default in the following table.

| `operator` value | Default symbol        | Default limits | Allowed limits                 |
| ---------------- | --------------------- | -------------- | ------------------------------ |
| `sum`            | $\sum$                | `bounds`       | `bounds`, `domain`             |
| `product`        | $\prod$               | `bounds`       | `bounds`, `domain`             |
| `integral`       | $\int$                | `bounds`       | `bounds`, `domain`             |
| `limit`          | $\lim$                | `approach`     | `approach`                     |
| `union`          | $\bigcup$             | `domain`       | `bounds`, `domain`             |
| `intersection`   | $\bigcap$             | `domain`       | `bounds`, `domain`             |
| `disjoint-union` | $\bigsqcup$           | `domain`       | `bounds`, `domain`             |
| `min`            | $\min$                | `domain`       | `bounds`, `domain`             |
| `max`            | $\max$                | `domain`       | `bounds`, `domain`             |
| `custom`         | From `operator-latex` | inferred       | `bounds`, `domain`, `approach` |

For approach limits, students choose the direction by default. The initial red `?` asks them to select `±` (two-sided), `−` (from the left), or `+` (from the right); it does not reveal the correct direction. To display a fixed direction instead, set `allow-limit-direction-input="false"`.

```html
<pl-big-operator-input
  answers-name="right-limit"
  correct-answer="Limit(1/x, (x, 0, '+'))"
  allow-limit-direction-input="false"
></pl-big-operator-input>
```

For an integral with `limits="domain"`, the domain appears as the only subscript, without an `index-variable \in` prefix. For example, the element renders `\int_\Gamma z\,\mathrm{d}z`. Use `grading-method="exact"` or `grading-method="component"` for this layout because SymPy does not have a lossless indexed representation for the notation.

### Custom operators

Provide `operator-latex` to use a symbol that is not built in. Either set `operator="custom"` or supply a complete `Custom(...)` correct answer so that the element can infer the operator. A custom correct answer uses one of these forms:

- Bounds: `Custom(body, (index, lower, upper))`
- Domain: `Custom(body, (index, domain))`
- Approach: `Custom(body, (index, target, direction))`

Valid approach directions are `"+"`, `"-"`, and `"+-"`.

```html
<pl-big-operator-input
  answers-name="expectation"
  correct-answer="Custom(k**2, (k, {1, 2}))"
  operator-latex="\mathbb{E}"
  grading-method="component"
></pl-big-operator-input>
```

```html
<pl-big-operator-input
  answers-name="evaluation"
  correct-answer="Custom(f(x), (x, 0, '+-'))"
  operator-latex="\operatorname{eval}"
  custom-functions="f"
  grading-method="component"
></pl-big-operator-input>
```

Custom operators change the displayed symbol and use the standard input layouts. They do not define a new SymPy operation. As a result:

- Custom operators do not support `grading-method="equivalent"`. Use `exact` or `component` grading instead.
- `limits="auto"` requires a parseable `Custom(...)` correct answer from which the element can infer the layout. Otherwise, set `limits` to `bounds`, `domain`, or `approach`.
- `operator-latex` is required. It controls presentation only; it does not define parsing or mathematical behavior.
- Without a correct answer, the element records submissions but does not grade them. This behavior is the same for custom and built-in operators.

## Correct answers

### Complete expressions

A complete, parseable `correct-answer` can provide the operator, index variable, limits layout, and limit direction. Supported strings begin with `Sum`, `Product`, `Integral`, `Limit`, `Union`, `Intersection`, `DisjointUnion`, `Min`, `Max`, or `Custom`.

The operator and limits tuple determine the layout:

In the table, `Name` means any supported operator name other than `Limit`.

| Complete answer form                                               | Inferred layout |
| ------------------------------------------------------------------ | --------------- |
| `Name(body, (index, domain))`                                      | `domain`        |
| `Name(body, (index, lower, upper))`                                | `bounds`        |
| `Limit(body, (index, target, direction))`                          | `approach`      |
| `Custom(body, (index, target, direction))` with a quoted direction | `approach`      |

For example, the following element infers `operator="product"`, `index-variable="k"`, and `limits="bounds"`:

```html
<pl-big-operator-input
  answers-name="total"
  correct-answer="Product(k + 1, (k, 1, 4))"
></pl-big-operator-input>
```

A domain integral can also omit both `operator` and `limits`:

```html
<pl-big-operator-input
  answers-name="contour"
  correct-answer="Integral(z**2, (z, Gamma))"
  variables="Gamma"
></pl-big-operator-input>
```

For a limit, use `Limit(body, (index, target, direction))`. The direction may be `"+"` (from the right), `"-"` (from the left), or `"+-"` (two-sided). An explicit `limit-direction` must agree with the direction in the correct answer.

In this example, the element infers the operator, approach layout, and two-sided direction. The student must still choose the direction from the initially unanswered `?` control:

```html
<pl-big-operator-input
  answers-name="sinc-limit"
  correct-answer="Limit(sin(x) / x, (x, 0, '+-'))"
></pl-big-operator-input>
```

Explicit `operator`, `index-variable`, `limits`, and `limit-direction` attributes take precedence over inferred values and must agree with the correct answer.

The complete expression may also be a canonical dictionary or a PrairieLearn SymPy JSON dictionary. A canonical dictionary identifies its operator and index with the `operator` and `index` fields. SymPy JSON supports `Sum`, `Product`, `Integral`, and `Limit` expressions. Raw SymPy objects, malformed answers, and unrecognized answer formats do not support inference; specify `operator` and `index-variable` explicitly in those cases.

### Setting the correct answer in `server.py`

Answers assigned in `server.py` must be JSON-serializable. Convert a supported SymPy expression to a string or use `prairielearn.sympy_utils.sympy_to_json`; do not assign a raw SymPy object to `data`.

```python title="server.py"
import prairielearn.sympy_utils as psu
import sympy


def generate(data):
    k = sympy.symbols("k")
    answer = sympy.Product(k + 1, (k, 1, 4))
    data["correct_answers"]["total"] = str(answer)
    # Alternatively: data["correct_answers"]["total"] = psu.sympy_to_json(answer)
```

PrairieLearn accepts string and SymPy JSON representations of a single-variable `sympy.Sum`, `sympy.Product`, or `sympy.Integral`, as well as `sympy.Limit`. A two-item integral tuple creates a domain layout, while a three-item tuple creates a bounds layout.

The variadic SymPy forms `Union`, `Intersection`, `DisjointUnion`, `Min`, and `Max` do not preserve an indexed complete expression. For these operators, use a string with `(index, domain)` or `(index, lower, upper)` as the second argument:

```html
<pl-big-operator-input
  answers-name="sets"
  correct-answer="Union({k, -k}, (k, {1, 2}))"
  grading-method="exact"
></pl-big-operator-input>
```

The same syntax supports `Intersection`, `DisjointUnion`, `Min`, and `Max`. The element normalizes these strings without evaluating away the index or limits.

### Machine-readable answer format

Every successfully prepared correct answer and successfully parsed student answer uses a flat, version 1 dictionary. Mathematical values use `sympy_to_json(..., allow_sets=True)`:

```python
# Canonical representation of Sum(k**2, (k, 1, n))
{
    "_type": "operator_expression",
    "_version": 1,
    "operator": "sum",
    "limits": "bounds",
    "index": psu.sympy_to_json(k),
    "lower": psu.sympy_to_json(1),
    "upper": psu.sympy_to_json(n),
    "body": psu.sympy_to_json(k**2),
}
```

The fields depend on the limits layout:

- Bounds answers use `lower`, `upper`, and `body`.
- Domain answers use `domain` and `body`.
- Approach answers use `target`, `direction`, and `body`.
- Custom answers include `operator_latex`; built-in answers do not.

When direction input is enabled, the student's raw selection is stored as `<answers-name>-direction` and copied to the canonical `direction` field. When direction input is disabled, the configured direction is inserted directly. The outer `_type` differs from PrairieLearn's reserved `sympy` leaf type.

### Accessing structured answers in `server.py`

Use [`pl.decode_operator_expression()`][prairielearn.operator_expression.decode_operator_expression] to validate the combined answer and decode its mathematical fields to SymPy values. Check the `limits` field before accessing layout-specific fields:

```python title="server.py"
import prairielearn as pl


def grade(data):
    submitted_json = data["submitted_answers"].get("total")
    if not isinstance(submitted_json, dict):
        return

    submitted = pl.decode_operator_expression(submitted_json)
    correct = pl.decode_operator_expression(data["correct_answers"]["total"])

    if submitted["limits"] == "bounds" and correct["limits"] == "bounds":
        submitted_body = submitted["body"]
        correct_body = correct["body"]
        submitted_lower = submitted["lower"]
        correct_lower = correct["lower"]
        # Apply custom grading logic to the decoded SymPy values.
```

After element processing:

- `correct_answers[answers-name]` contains the canonical correct answer.
- `submitted_answers[answers-name]` contains a canonical dictionary when parsing succeeds, `""` for an allowed blank answer, or `None` when parsing fails.
- Internal field names such as `<answers-name>-body` and `<answers-name>-start` remain available in `raw_submitted_answers` and `format_errors` for redisplay and field-specific feedback. They are not separate processed answers.

## Grading

The `grading-method` attribute supports three modes:

| Method       | Behavior                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `exact`      | Requires the operator, layout, direction, index, and every SymPy component to match exactly.                                                                             |
| `equivalent` | Builds complete SymPy expressions and checks whether they are mathematically equivalent. It first checks structural equality, then tests whether the difference is zero. |
| `component`  | Checks each visible field separately for mathematical equivalence. This method does not change how the correct answer is specified.                                      |

For domain equivalence, the element expands only a concrete `FiniteSet`. A symbolic or infinite domain fails with an explicit error instead of being expanded.

If no correct answer is supplied through the attribute or `data["correct_answers"]`, the element is ungraded. It still parses and stores the combined answer, but it does not assign a partial score. Submission panels display the answer without a score badge, and answer panels display nothing.

Blank-answer validation is controlled separately by `allowed-blank`. A student-entered direction is part of the limits, so `allowed-blank="limits"` and `allowed-blank="all"` allow the direction to remain unanswered.

## Example implementations

- [element/bigOperatorInput]

## See also

- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)

---

[element/bigoperatorinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOperatorInput

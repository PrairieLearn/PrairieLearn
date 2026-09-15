# `pl-big-operator-input` element

Displays a sum, integral, limit, or other indexed operator. Students enter the index values and body in separate fields.

The fields accept the same symbolic syntax as [`pl-symbolic-input`](pl-symbolic-input.md).

## Sample element

```html title="question.html"
<pl-big-operator-input
  answers-name="total"
  correct-answer="Sum(k**2, (k, 1, n))"
  variables="n"
></pl-big-operator-input>
```

![A bounded sum with fields for the upper bound, lower bound, and body](pl-big-operator-input-bounded-sum.png)

The complete answer `Sum(k**2, (k, 1, n))` configures the sum symbol, the index variable `k`, the bounds `1` and `n`, and the body `k**2`.

Every element requires a complete answer. Set it with either the `correct-answer` attribute or `data["correct_answers"]` in `server.py`. To display the input without grading it, set `grading-method="none"`.

## Customizations

| Attribute                        | Type                                                  | Default        | Description                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-complex`                  | boolean                                               | false          | Whether to allow complex numbers. Students may use `i` or `j` as the imaginary unit.                                                                                  |
| `allow-approach-direction-input` | boolean                                               | true           | Whether students choose the approach direction. When `false`, the direction in the correct answer is shown. Only valid for limits and custom operators with a target. |
| `allowed-blank`                  | `"none"`, `"indices"`, `"body"`, or `"all"`           | `"none"`       | Which parts of the answer students may leave blank.                                                                                                                   |
| `answers-name`                   | string                                                | —              | Name used to store the answer. This value must be unique within a question.                                                                                           |
| `body-relative-weight`           | integer                                               | 3              | Weight of the body when `grading-method="component"`. Each index field has a weight of 1.                                                                             |
| `body-size`                      | integer                                               | 16             | Positive character width of the body field.                                                                                                                           |
| `correct-answer`                 | string                                                | —              | Complete answer in `Func(...)` format. Defaults to `data["correct_answers"][answers-name]`.                                                                           |
| `custom-functions`               | string                                                | —              | Comma-separated list of symbolic function names allowed in answers, such as `"f,g"`.                                                                                  |
| `display`                        | `"block"` or `"inline"`                               | `"block"`      | Whether the input is centered on its own line or aligned with surrounding text.                                                                                       |
| `display-log-as-ln`              | boolean                                               | false          | Whether to display `ln` rather than `log`. Both names are accepted in student answers and treated as equivalent.                                                      |
| `grading-method`                 | `"exact"`, `"component"`, `"equivalent"`, or `"none"` | `"equivalent"` | How to compare the student answer with the correct answer. See [Grading](#grading).                                                                                   |
| `imaginary-unit-for-display`     | `"i"` or `"j"`                                        | `"i"`          | Imaginary unit shown in displayed answers. Students may enter either unit when `allow-complex="true"`.                                                                |
| `index-field-size`               | integer                                               | 7 or 10        | Positive character width of each index field. The default is 7 for bounds and 10 for a domain or limit.                                                               |
| `operator-latex`                 | string                                                | —              | LaTeX used instead of the standard operator symbol. Required for `Custom(...)`.                                                                                       |
| `prefix-latex`                   | string                                                | —              | LaTeX displayed immediately before the operator.                                                                                                                      |
| `show-help-text`                 | boolean                                               | true           | Whether to show symbolic-input help beside the body field.                                                                                                            |
| `suffix-latex`                   | string                                                | —              | LaTeX displayed immediately after the operator.                                                                                                                       |
| `variables`                      | string                                                | —              | Comma-separated list of allowed symbols in addition to the index variable, such as `"Gamma,k,N"`.                                                                     |
| `weight`                         | integer                                               | 1              | Weight used when computing a weighted average score across elements.                                                                                                  |

## Complete answer syntax

In `question.html`, the `Func(...)` answer configures the operator and its index fields. Start the correct answer with one of these function names:

<div class="big-operator-formats" markdown>

| Function        | Bounds                                          | Domain                                                       | Approaches                                                    |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `Sum`           | $\displaystyle\sum_{k=1}^{n} k^2$               | $\displaystyle\sum_{k\in S}^{\phantom{n}} k^2$               | Not Supported                                                 |
| `Product`       | $\displaystyle\prod_{k=1}^{n} k$                | $\displaystyle\prod_{k\in S}^{\phantom{n}} k$                | Not Supported                                                 |
| `Integral`      | $\displaystyle\int_0^1 x^2\,\mathrm dx$         | $\displaystyle\int_\Gamma^{\phantom{1}} z^2\,\mathrm dz$     | Not Supported                                                 |
| `Union`         | $\displaystyle\bigcup_{k=1}^{n} A_k$            | $\displaystyle\bigcup_{k\in S}^{\phantom{n}} A_k$            | Not Supported                                                 |
| `Intersection`  | $\displaystyle\bigcap_{k=1}^{n} A_k$            | $\displaystyle\bigcap_{k\in S}^{\phantom{n}} A_k$            | Not Supported                                                 |
| `DisjointUnion` | $\displaystyle\bigsqcup_{k=1}^{n} A_k$          | $\displaystyle\bigsqcup_{k\in S}^{\phantom{n}} A_k$          | Not Supported                                                 |
| `Min`           | Not Supported                                   | $\displaystyle\min_{k\in S}^{\phantom{n}} a_k$               | Not Supported                                                 |
| `Max`           | Not Supported                                   | $\displaystyle\max_{k\in S}^{\phantom{n}} a_k$               | Not Supported                                                 |
| `Limit`         | Not Supported                                   | Not Supported                                                | $\displaystyle\lim_{x\to 0} f(x)$                             |
| `Custom`        | $\displaystyle\mathop{\Huge\star}_{k=1}^{n}a_k$ | $\displaystyle\mathop{\Huge\star}_{k\in S}^{\phantom{n}}a_k$ | $\displaystyle\mathop{\Huge\star}_{x\to 0}^{\phantom{n}}f(x)$ |

</div>

The tuple in the second argument configures the index fields:

| Index format | Correct answer pattern                     | Student input fields               |
| ------------ | ------------------------------------------ | ---------------------------------- |
| Bounds       | `Func(body, (index, lower, upper))`        | Lower bound, upper bound, and body |
| Domain       | `Func(body, (index, domain))`              | Domain and body                    |
| Approaches   | `Limit(body, (index, target, direction))`  | Target, direction, and body        |
| Approaches   | `Custom(body, (index, target, direction))` | Target, direction, and body        |

For example, this bounded product has index `k`, lower bound `1`, upper bound `4`, and body `k + 1`:

```html
<pl-big-operator-input
  answers-name="total"
  correct-answer="Product(k + 1, (k, 1, 4))"
></pl-big-operator-input>
```

This domain integral displays the correct answer $\displaystyle\int_\Gamma z^2\,\mathrm dz$:

```html
<pl-big-operator-input
  answers-name="contour"
  correct-answer="Integral(z**2, (z, Gamma))"
  variables="Gamma"
  grading-method="component"
></pl-big-operator-input>
```

For a domain integral, the domain appears by itself below the integral symbol rather than after an index and $\in$ symbol. Domain integrals cannot use `grading-method="equivalent"`; use `exact`, `component`, or `none` instead.

![A domain-indexed sum with a domain field below the operator and a body field to its right](pl-big-operator-input-sum.png)

### Accepted values in each field

Bounds, limit targets, and most operator bodies accept mathematical expressions. Domains accept set notation, such as `{1, 2}` or `[0, 1]`, as well as a symbol representing a set. Add any non-index symbols to `variables`.

The bodies of `Union`, `Intersection`, and `DisjointUnion` must also be sets. For example:

```html title="question.html"
<pl-big-operator-input
  answers-name="sets"
  correct-answer="Union({k, -k}, (k, {1, 2}))"
  grading-method="exact"
></pl-big-operator-input>
```

Unlike `pl-symbolic-input`, this element does not have an `allowed-types` attribute. The operator and index format determine what each field accepts.

### Limits

Use `Limit(body, (index, target, direction))`, where direction is `"+"` (from the right), `"-"` (from the left), or `"+-"` (two-sided).

By default, students must choose the direction. The initial `?` does not reveal the correct choice.

![A limit with a target field, an unanswered direction selector, and a body field](pl-big-operator-input-limit.png)

This example creates a two-sided limit:

```html
<pl-big-operator-input
  answers-name="sinc-limit"
  correct-answer="Limit(sin(x) / x, (x, 0, '+-'))"
></pl-big-operator-input>
```

To show the correct direction instead of asking the student to choose it, set `allow-approach-direction-input="false"`:

```html
<pl-big-operator-input
  answers-name="right-limit"
  correct-answer="Limit(1/x, (x, 0, '+'))"
  allow-approach-direction-input="false"
></pl-big-operator-input>
```

### Custom operators

Use `Custom(...)` with `operator-latex` to display an operator that is not listed above. Custom operators use the same bounds, domain, and approaches patterns as the built-in operators.

![A custom star operator with lower-bound, upper-bound, and body fields](pl-big-operator-input-custom.png)

```html
<pl-big-operator-input
  answers-name="example-custom"
  correct-answer="Custom(j**2, (j, 1, 10))"
  operator-latex="\displaystyle{\Huge\bigstar{}}"
  grading-method="component"
></pl-big-operator-input>
```

An approaches-style custom operator uses the same direction symbols as `Limit(...)`:

```html
<pl-big-operator-input
  answers-name="evaluation"
  correct-answer="Custom(f(x), (x, 0, '+-'))"
  operator-latex="\operatorname{eval}"
  custom-functions="f"
  grading-method="component"
></pl-big-operator-input>
```

`operator-latex` changes only the displayed symbol; it does not define a new mathematical operation. For this reason, custom operators cannot use `grading-method="equivalent"`. Use `exact`, `component`, or `none`.

### Adding notation before or after the operator

Use `prefix-latex` and `suffix-latex` to present the input as part of a larger equation. For example, they can add $\Gamma(z) =$ before an integral and $\mathrm{d}t, \operatorname{Re}(z) > 0$ after it.

![A bounded integral with mathematical notation before and after the input](pl-big-operator-input-integral.png)

## Grading

| Method       | Behavior                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `equivalent` | Accepts a student answer that is mathematically equivalent to the complete correct answer. This is the default.                    |
| `component`  | Grades each visible field separately for mathematical equivalence. The body has the relative weight set by `body-relative-weight`. |
| `exact`      | Requires the operator, index format, direction, index, and each mathematical value to match the correct answer exactly.            |
| `none`       | Accepts any input but awards no points. The configured correct answer is still displayed in the answer panel.                      |

When using `equivalent` grading with a domain, the domain must be a concrete finite set, such as `{1, 2, 3}`. Use `component` or `exact` for a symbolic or infinite domain.

Use `allowed-blank` separately to control whether students may omit index fields, the body, or both. For a limit with a direction selector, the direction counts as an index field.

## Setting the answer in `server.py`

For a randomized question, omit `correct-answer` and assign the answer to `data["correct_answers"][answers-name]`. You can use the same `Func(...)` syntax as in `question.html`:

```python title="server.py"
import random


def generate(data):
    upper = random.randint(4, 8)
    data["params"]["upper"] = upper
    data["correct_answers"]["total"] = f"Product(k + 1, (k, 1, {upper}))"
```

You can also build a `Sum`, `Product`, `Integral`, or `Limit` with SymPy and convert it to JSON:

```python title="server.py"
import prairielearn.sympy_utils as psu
import sympy


def generate(data):
    k = sympy.Symbol("k")
    answer = sympy.Product(k + 1, (k, 1, 4))
    data["correct_answers"]["total"] = psu.sympy_to_json(answer)
```

Use `pbo.big_operator_to_json()` when you want to provide the operator, indexing, and mathematical values separately. Mathematical fields accept SymPy values, strings, Python integers, and Python sets. This is particularly useful for custom operators:

```python title="server.py"
import prairielearn.big_operator_utils as pbo
import sympy


def generate(data):
    x = sympy.Symbol("x")
    data["correct_answers"]["evaluation"] = pbo.big_operator_to_json(
        operator="Custom",
        indexing="approaches",
        index=x,
        target=0,
        direction="two-sided",
        body=sympy.Function("f")(x),
    )
```

```html title="question.html"
<pl-big-operator-input
  answers-name="evaluation"
  operator-latex="\operatorname{eval}"
  custom-functions="f"
  grading-method="component"
></pl-big-operator-input>
```

### Custom grading in `server.py`

Most questions should use one of the built-in grading methods. For custom grading, use [`pbo.json_to_big_operator()`][prairielearn.big_operator_utils.json_to_big_operator] to validate the combined answer and convert its mathematical fields to SymPy values. Check `indexing` before accessing fields that are specific to bounds, domains, or limits.

```python title="server.py"
import prairielearn.big_operator_utils as pbo


def grade(data):
    submitted_json = data["submitted_answers"].get("total")
    if not isinstance(submitted_json, dict):
        return

    submitted = pbo.json_to_big_operator(submitted_json)
    correct = pbo.json_to_big_operator(data["correct_answers"]["total"])

    if submitted["indexing"] == "bounds" and correct["indexing"] == "bounds":
        submitted_body = submitted["body"]
        correct_body = correct["body"]
        # Apply custom grading logic to the decoded SymPy values.
```

## Example implementations

- [element/bigOperatorInput]

## See also

- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)

---

[element/bigoperatorinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOperatorInput

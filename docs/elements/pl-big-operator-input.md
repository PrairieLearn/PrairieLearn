# `pl-big-operator-input` element

This element collects an indexed big-operator expression in separate limit and body fields while storing one lossless, JSON-safe combined answer.

Its visible component fields are rendered and parsed by PrairieLearn's official `pl-symbolic-input` element.
The wrapper is responsible for the operator layout, canonical aggregate answer, and grading; `pl-symbolic-input` owns the MathLive editor and symbolic-input parsing behavior.

## Sample element

```html title="question.html"
<pl-big-operator-input
  answers-name="total"
  correct-answer="Sum(k**2, (k, 1, n))"
  variables="n"
></pl-big-operator-input>
```

The `correct-answer` attribute keeps the complete mathematical expression together and lets the element infer the operator and limits layout.

## Customizations

| Attribute                     | Type                                                                                                                            | Default        | Description                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-complex`               | boolean                                                                                                                         | false          | Whether complex numbers (expressions with `i` or `j` as the imaginary unit) are allowed.                                                                                                 |
| `allow-limit-direction-input` | boolean                                                                                                                         | true           | Whether students select the direction for approach limits. When `false`, the configured `limit-direction` is displayed as fixed. This attribute cannot be used with non-approach limits. |
| `allowed-blank`               | `"none"`, `"limits"`, `"body"`, or `"all"`                                                                                      | `"none"`       | Which fields may be left blank.                                                                                                                                                          |
| `answers-name`                | string                                                                                                                          | —              | Name used to store the combined answer. This value must be unique within a question.                                                                                                     |
| `body-relative-weight`        | integer                                                                                                                         | 3              | Body weight when using component grading. Every limit component has a weight of 1.                                                                                                       |
| `body-size`                   | integer                                                                                                                         | 16             | Positive character width of the body input.                                                                                                                                              |
| `correct-answer`              | string                                                                                                                          | —              | Correct answer as a parseable whole expression. The operator, index variable, limits form, and limit direction are inferred when possible.                                               |
| `custom-functions`            | string                                                                                                                          | —              | Comma-separated symbolic function names allowed in correct answers and student input, e.g. `"f,g"`.                                                                                      |
| `grading-method`              | `"exact"`, `"component"`, or `"equivalent"`                                                                                     | `"equivalent"` | How to grade the combined answer.                                                                                                                                                        |
| `index-variable`              | string                                                                                                                          | —              | Bound symbol, which is automatically allowed in the body. Required when it cannot be inferred from `correct-answer`.                                                                     |
| `limit-direction`             | `"two-sided"`, `"from-left"`, or `"from-right"`                                                                                 | `"two-sided"`  | Direction for approach limits. This value is inferred from `correct-answer` when possible.                                                                                               |
| `limit-size`                  | integer                                                                                                                         | 7 or 10        | Positive character width of every limit input. The default is 7 for bounds and 10 for domain or approach limits.                                                                         |
| `limits`                      | `"auto"`, `"bounds"`, `"domain"`, or `"approach"`                                                                               | `"auto"`       | Limits form to display. `auto` first infers the form from `correct-answer`, then falls back to the operator default shown below.                                                         |
| `operator`                    | `"sum"`, `"product"`, `"integral"`, `"limit"`, `"union"`, `"intersection"`, `"disjoint-union"`, `"min"`, `"max"`, or `"custom"` | —              | Operator to display and grade. Required when it cannot be inferred from `correct-answer`; use `custom` for a custom LaTeX operator.                                                      |
| `operator-latex`              | string                                                                                                                          | —              | Operator display LaTeX. Required for custom operators; for built-in operators, it overrides the default symbol.                                                                          |
| `show-help-text`              | boolean                                                                                                                         | true           | Whether to show symbolic-entry help beside the body input.                                                                                                                               |
| `variables`                   | string                                                                                                                          | —              | Comma-separated extra allowed symbols beyond the index variable, e.g. `"Gamma,k,N"`.                                                                                                     |
| `weight`                      | integer                                                                                                                         | 1              | Weight to use when computing a weighted average score over elements.                                                                                                                     |

## Operators and limits

With `limits="auto"`, the element first tries to infer the limits form from a whole correct answer.
The auto limits in the table below are fallbacks used only when that inference fails or is unavailable.

| Operator                           | LaTeX                             | Auto limits | Explicit limits          |
| ---------------------------------- | --------------------------------- | ----------- | ------------------------ |
| Sum                                | $\sum$                            | bounds      | bounds, domain           |
| Product                            | $\prod$                           | bounds      | bounds, domain           |
| Integral                           | $\int$                            | bounds      | bounds, domain           |
| Limit                              | $\lim$                            | approach    | approach only            |
| Union, Intersection, DisjointUnion | $\bigcup$, $\bigcap$, $\bigsqcup$ | domain      | bounds, domain           |
| Min, Max                           | $\min$, $\max$                    | domain      | bounds, domain           |
| Custom                             | —                                 | inferred    | bounds, domain, approach |

`bounds` forms collect a lower bound, an upper bound, and a body. `domain` forms collect a domain and a body.
Lastly, `approach` forms collect a target bound and a body.
The element displays and parses only the inputs required by the selected form.

Approach forms show a required limit-direction selector by default.
Its red `?` prompt requires the student to deliberately choose `±` (two-sided), `−` (from-left), or `+` (from-right); it never reveals the correct direction.
Set `allow-limit-direction-input="false"` to render `limit-direction` as fixed notation instead.
The attribute is invalid on non-approach forms.

### Custom operators

Here are some examples of the custom operator in use:

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
  operator-latex="\operatorname{eval}"
  custom-functions="f"
  correct-answer="Custom(f(x), (x, 0, '+-'))"
  grading-method="component"
></pl-big-operator-input>
```

A custom correct answer uses `Custom(body, (index, lower, upper))` for bounds,
`Custom(body, (index, domain))` for a domain, or
`Custom(body, (index, target, direction))` for an approach.
Valid approach directions are `"+"`, `"-"`, and `"+-"`.

To supply the sidedness instead of asking the student for it:

```html
<pl-big-operator-input
  answers-name="right-limit"
  correct-answer="Limit(1/x, (x, 0, '+'))"
  allow-limit-direction-input="false"
></pl-big-operator-input>
```

For an integral with `limits="domain"`, the domain is rendered as the sole subscript without an `index-variable \in` prefix, for example `\int_\Gamma z\,\mathrm{d}z`.
Use `exact` or `component` grading because SymPy has no lossless indexed representation for this notation.

### Limitations of custom operators

Custom operators provide a custom display symbol and the standard input layouts; they do not define a new symbolic operation in SymPy.
Consequently:

- `grading-method="equivalent"` is unavailable.
  A graded custom operator must
  use `grading-method="exact"` or `grading-method="component"`.
- `limits="auto"` works only when a parseable whole `Custom(...)` correct answer
  supplies the limits form.
  Otherwise, set `limits` explicitly to `bounds`,
  `domain`, or `approach`.
- `operator-latex` controls presentation only and must be supplied.
  It does not
  provide parsing or mathematical semantics for the operator.
- Without a correct answer, the element records submissions but remains
  ungraded, just like an ungraded built-in operator.

## Correct answers

### Parsable `correct-answer`

When `operator` is omitted, a correct answer supplied as a string or JSON-safe dictionary identifies the built-in operator, index-string, and limits.
Supported strings begin with `Sum`, `Product`, `Integral`, `Limit`, `Union`, `Intersection`, `DisjointUnion`, `Min`, `Max`, or `Custom`.
A canonical dictionary uses its `operator` field, while a PrairieLearn SymPy JSON dictionary can identify the formatted `Sum`, `Product`, `Integral`, and `Limit` expressions.
In parseable whole answers, `(index, domain)` selects `limits="domain"`, `(index, lower, upper)` selects `limits="bounds"`, and a `Limit` selects `limits="approach"`.
The formatted variadic syntax described below uses the same tuple-length rule.
An explicit `limits` attribute remains authoritative and must agree with the answer.

```html
<pl-big-operator-input
  answers-name="total"
  correct-answer="Product(k + 1, (k, 1, 4))"
></pl-big-operator-input>
```

A domain integral can therefore omit both the operator and limits attributes:

```html
<pl-big-operator-input
  answers-name="contour"
  correct-answer="Integral(z**2, (z, Gamma))"
  variables="Gamma"
></pl-big-operator-input>
```

A limit uses the parseable form `Limit(body, (index, target, direction))`.
Valid direction strings are `"+"` (from the right), `"-"` (from the left), and `"+-"`
(two-sided).
When `limit-direction` is omitted, it is inferred from this value; an explicit attribute must agree.
This remains the correct direction whether it is student-entered or fixed.
For example, the operator, approach layout, and two-sided direction are inferred here, while the student selects the direction from an initially unanswered `?` control:

```html
<pl-big-operator-input
  answers-name="sinc-limit"
  correct-answer="Limit(sin(x) / x, (x, 0, '+-'))"
></pl-big-operator-input>
```

Strings and SymPy JSON dictionaries can also be assigned in `server.py`:

```python
k = sympy.symbols("k")
ans = sympy.Product(k + 1, (k, 1, 4))
data["correct_answers"]["total"] = str(ans)
# Alternatively: ... = psu.sympy_to_json(ans)
```

A canonical structured dictionary, in the format below, is another inferable answer source because it includes `"operator"` and `"index"`.
Whole answer strings and SymPy JSON also identify their bound symbol, so `index-variable` can be omitted for these parseable forms.
Explicit HTML `operator` and `index-variable` values always take precedence and are checked against the answer.
Raw SymPy objects do not trigger inference, so they require an explicit `operator` and `index-variable`.
Ungraded, malformed, or otherwise unrecognized answers likewise require explicit configuration.

Answers assigned in `server.py` must be JSON-serializable.
Do not assign a raw SymPy object to `data`; convert supported expressions to a string or use `prairielearn.sympy_utils.sympy_to_json`.

String or `sympy_to_json` representations of single-variable `sympy.Sum`, `sympy.Product`, and `sympy.Integral`, plus `sympy.Limit`, are accepted as author conveniences and normalized during `prepare()`.
Two-item integral tuples become domain forms and three-item tuples become bounds forms.
Do not put raw SymPy objects in `data`, because PrairieLearn question data must remain JSON-serializable.
Variadic SymPy `Union`, `Intersection`, `DisjointUnion`, `Min`, and `Max` do not preserve an indexed whole-answer format and therefore are never accepted as substitutes for one.

The variadic operators accept a parseable whole-answer syntax that preserves the index and limits, using `(index, domain)` or `(index, lower, upper)` as the second argument:

```html
<pl-big-operator-input
  answers-name="sets"
  correct-answer="Union({k}, (k, {1, 2}))"
  grading-method="exact"
></pl-big-operator-input>
```

The same form supports `Intersection`, `DisjointUnion`, `Min`, and `Max`.
These strings normalize to the canonical answer without evaluating away the index and limits.

### Canonical representation

Every prepared or parsed answer is a flat version 1 dictionary.
Mathematical leaves use `sympy_to_json(..., allow_sets=True)`:

```python
# canonical JSON repr of Sum(k ** 2, (k, 1, n))
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

- Range answers use `lower` and `upper`, as seen above.
- Domain answers replace `lower` and `upper` with `domain`.
- Approach answers use `target`, `direction`, and `body`.
  When direction input
  is enabled, the raw selection is stored as `<answers-name>-direction` and
  copied into canonical `direction`; when disabled, the configured direction is
  inserted directly.
  The outer `_type` is intentionally distinct from
  PrairieLearn's reserved `sympy` leaf type.
- Custom submissions use the same form-dependent components and add
  `"operator_latex"`; built-in answers do not include that key.

## Grading

There are three grading modes:

- `exact` requires an identical canonical operator, form, direction, index, and exact SymPy components.
- `equivalent` constructs formal SymPy expressions and tests their equivalence, first by structural equality then using `a - b =? 0`.
  - Domain equivalence expands only a concrete `FiniteSet`; symbolic or infinite domains fail explicitly rather than being expanded eagerly.
- `component` checks corresponding visible components using equivalent grading. This grading method does not change how the correct answer is authored.

If no correct answer is supplied through an attribute or `data["correct_answers"]`, the element is ungraded.
It still parses and stores the combined canonical response, but it does not create a partial score.
Submission panels display the response without a score badge, and answer panels render nothing. Blank-response validation remains controlled separately by `allowed-blank`.
A student-entered direction counts as part of the limits, so `allowed-blank="limits"` and `allowed-blank="all"` permit its unanswered value.

## Example implementations

- [element/bigOperatorInput]

## See also

- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)

---

[element/bigoperatorinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOperatorInput

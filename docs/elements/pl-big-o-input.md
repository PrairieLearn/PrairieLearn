# `pl-big-o-input` element

Fill in the blank field that allows for asymptotic mathematical input (i.e. big O, big Theta, etc.).
Gives automated feedback in the case of improper asymptotic input.

```html title="question.html"
<pl-big-o-input answers-name="ans" variables="n" correct-answer="n**2" size="10"></pl-big-o-input>
```

## Customizations

| Attribute        | Type                                                               | Default                   | Description                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank`    | boolean                                                            | false                     | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format).                                                                         |
| `answers-name`   | string                                                             | —                         | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.              |
| `aria-label`     | string                                                             | —                         | An accessible label for the input.                                                                                                                                                |
| `blank-value`    | string                                                             | 1 (one)                   | Value to be used as an answer if element is left blank. Only applied if `allow-blank` is `true`. Must be `""` (empty string) or follow the same format as an expected user input. |
| `correct-answer` | string                                                             | —                         | Correct answer for grading. A blank correct answer (`correct-answer=""`) is only valid when `allow-blank="true"` and `blank-value=""`.                                            |
| `display`        | `"block"` or `"inline"`                                            | `"inline"`                | How to display the input field.                                                                                                                                                   |
| `initial-value`  | string                                                             | —                         | Initial value to prefill the input box the first time it is rendered.                                                                                                             |
| `placeholder`    | string                                                             | `"asymptotic expression"` | Hint displayed inside the input box describing the expected type of input.                                                                                                        |
| `show-help-text` | boolean                                                            | true                      | Show the question mark at the end of the input displaying required input parameters.                                                                                              |
| `show-score`     | boolean                                                            | true                      | Whether to show the score badge and feedback next to this element.                                                                                                                |
| `size`           | integer                                                            | 35                        | Size of the input box.                                                                                                                                                            |
| `type`           | `"big-o"`, `"theta"`, `"omega"`, `"little-o"`, or `"little-omega"` | `"big-o"`                 | Type of asymptotic answer required.                                                                                                                                               |
| `variables`      | string                                                             | —                         | A comma-delimited list of symbols that can be used in the symbolic expression. Up to 7 variables are supported. If omitted, the variables are inferred from the `correct-answer`. |
| `weight`         | integer                                                            | 1                         | Weight to use when computing a weighted average score over elements.                                                                                                              |

### Migrating from deprecated attributes

The following deprecated attribute is still supported for backward compatibility:

| Old syntax           | New syntax            |
| -------------------- | --------------------- |
| `variable="<value>"` | `variables="<value>"` |

The `variable` attribute cannot be used together with `variables`.

## Details

Correct answers must be specified as strings with Python syntax (e.g., `n**2`, `2**n`, `n * log(n)`), with
the same syntax as [`pl-symbolic-input`](pl-symbolic-input.md). Up to 7 variables are supported.

When the `variables` attribute is omitted, the element infers the variables from the free symbols of the
`correct-answer` (e.g., `correct-answer="n**2"` infers `n`).

### Multivariate Limitations

The backend to evaluating Big-O statements and providing feedback takes the limit of the student's answer against the correct answer using Sympy. Sympy only supports single variable limits, so the best approximation is to evaluate all unidirectional limits in every nested order.
This leads to a few limitations/behaviors that should be considered when using multiple variables:

- Sympy views `x*y` and `y*x` as different expressions, thus students will not be told whether their expression is unsimplified (e.g. `n^(1+1)`).
- Expressions with mixed lower-order terms which would evaluate to a constant when the limit is taken with equal growth rates will give the feedback that the student has included "lower-order terms" instead of the mathematically possible "additional constant factors" (e.g., `x^2+2xy+y^2` over `x^2+y^2`).
- Some expressions (usually with nested exponentials & factorials) will have unsolvable limits with Sympy, and cannot give correct partial feedback. If you require such expressions it is recommended to use `pl-symbolic-input` instead, which will only check for equality.
- Big-O expressions with many variables will be slower, and if multiple instances of 7-variable Big-O inputs exist, the question may timeout.

## Example implementations

- [element/bigOInput]

## See also

- [`pl-number-input` for numeric input](pl-number-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-string-input` for string input](pl-string-input.md)
- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)

---

[element/bigoinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOInput

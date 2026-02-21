# `pl-big-o-input` element

Fill in the blank field that allows for asymptotic mathematical input (i.e. big O, big Theta, etc.).
Gives automated feedback in the case of improper asymptotic input.

```html title="question.html"
<pl-big-o-input answers-name="ans" variable="n" correct-answer="n**2" size="10"></pl-big-o-input>
```

## Customizations

| Attribute        | Type                                                               | Default                   | Description                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank`    | boolean                                                            | false                     | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format).                                                                         |
| `answers-name`   | string                                                             | —                         | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.              |
| `blank-value`    | string                                                             | 1 (one)                   | Value to be used as an answer if element is left blank. Only applied if `allow-blank` is `true`. Must be `""` (empty string) or follow the same format as an expected user input. |
| `correct-answer` | string                                                             | —                         | Correct answer for grading.                                                                                                                                                       |
| `display`        | `"block"` or `"inline"`                                            | `"inline"`                | How to display the input field.                                                                                                                                                   |
| `initial-value`  | string                                                             | —                         | Initial value to prefill the input box the first time it is rendered.                                                                                                             |
| `placeholder`    | string                                                             | `"asymptotic expression"` | Hint displayed inside the input box describing the expected type of input.                                                                                                        |
| `show-help-text` | boolean                                                            | true                      | Show the question mark at the end of the input displaying required input parameters.                                                                                              |
| `show-score`     | boolean                                                            | true                      | Whether to show the score badge and feedback next to this element.                                                                                                                |
| `size`           | integer                                                            | 35                        | Size of the input box.                                                                                                                                                            |
| `type`           | `"big-o"`, `"theta"`, `"omega"`, `"little-o"`, or `"little-omega"` | `"big-o"`                 | Type of asymptotic answer required.                                                                                                                                               |
| `variable`       | string                                                             | —                         | A symbol for use in the symbolic expression. Only one variable supported.                                                                                                         |
| `weight`         | integer                                                            | 1                         | Weight to use when computing a weighted average score over elements.                                                                                                              |

## Details

Correct answers must be specified as strings with Python syntax (e.g., `n**2`, `2**n`, `n * log(n)`), with
the same syntax as [`pl-symbolic-input`](pl-symbolic-input.md). Only one variable is supported.

## Example implementations

- [element/bigOInput]

## See also

- [`pl-number-input` for numeric input](pl-number-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-string-input` for string input](pl-string-input.md)
- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)

---

[element/bigoinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOInput

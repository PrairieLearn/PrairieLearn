# `pl-string-input` element

Fill in the blank field that allows for **string** value input.

## Sample element

![Screenshot of the pl-string-input element](pl-string-input.png)

```html title="question.html"
<pl-string-input answers-name="string_value" label="Prairie"></pl-string-input>
```

```python title="server.py"
def generate(data):

    # Answer to fill in the blank input
    data["correct_answers"]["string_value"] = "Learn"
```

## Customizations

| Attribute                 | Type                    | Default         | Description                                                                                                                                                               |
| ------------------------- | ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank`             | boolean                 | false           | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format).                                                                 |
| `answers-name`            | string                  | —               | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.      |
| `aria-label`              | string                  | —               | An accessible label for the element.                                                                                                                                      |
| `correct-answer`          | string                  | See description | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`.                                                                                          |
| `correct-answer-format`   | `"exact"` or `"regex"`  | `"exact"`       | If `"regex"`, the correct answer is treated as a Python regular expression and matched using `re.fullmatch()`. The `ignore-case` attribute, if `true`, also enables `re.IGNORECASE`. Other flags can be enabled inline (e.g., `(?x)` for verbose, `(?s)` for dotall). |
| `correct-answer-text`     | string                  | —               | If provided, this text is shown in the answer panel instead of the raw correct answer. Useful when `correct-answer-format="regex"` to display a human-readable form of the regex pattern.                                                                            |
| `display`                 | `"block"` or `"inline"` | `"inline"`      | How to display the input field. Default is `"block"` if `multiline` is enabled.                                                                                           |                                                                                   
| `ignore-case`             | boolean                 | false           | Whether to enforce case sensitivity (e.g. "hello" != "HELLO").                                                                                                            |
| `initial-value`           | string                  | —               | Initial value is added to the text box the first time it is rendered.                                                                                                     |
| `label`                   | string                  | —               | A prefix to display before the input box (e.g., `label="$x =$"`).                                                                                                         |
| `multiline`               | boolean                 | false           | Whether to allow for multiline input using a `textarea` display.                                                                                                          |
| `normalize-to-ascii`      | boolean                 | false           | Whether non-English characters (accents, non-latin alphabets, fancy quotes) should be normalized to equivalent English characters before submitting the file for grading. |
| `placeholder`             | string                  | —               | Hint displayed inside the input box describing the expected type of input.                                                                                                |
| `remove-leading-trailing` | boolean                 | See description | Whether to remove leading and trailing blank spaces from the input string. Defaults to `true` if `multiline` is enabled, otherwise `false`.                               |
| `remove-spaces`           | boolean                 | false           | Whether to remove blank spaces from the input string.                                                                                                                     |
| `show-help-text`          | boolean                 | true            | Show the question mark at the end of the input displaying required input parameters.                                                                                      |
| `size`                    | integer                 | 35              | Width of the input box.                                                                                                                                                   |
| `suffix`                  | string                  | —               | A suffix to display after the input box (e.g., `suffix="items"`).                                                                                                         |
| `weight`                  | integer                 | 1               | Weight to use when computing a weighted average score over elements.                                                                                                      |

## Using regex matching

Setting `correct-answer-format="regex"` allows the correct answer to be specified as a Python regular expression. The student's answer is graded using `re.fullmatch()`, which requires the entire submitted answer to match the pattern.

For example, the following question accepts either `N` or `nitrogen` (or, with `ignore-case="true"`, `n`, `Nitrogen`, `NITROGEN`, etc.):
```html title="question.html"
<pl-string-input
    answers-name="element"
    correct-answer="N|nitrogen"
    correct-answer-format="regex"
    correct-answer-text="N or nitrogen"
    ignore-case="true">
</pl-string-input>
```
By default, the regex pattern itself is shown in the answer panel. To display a more student-friendly form, use the `correct-answer-text` attribute as in the example above.

The `ignore-case` attribute enables `re.IGNORECASE` for the pattern. Other regex flags can be enabled inline using Python's regex syntax: `(?x)` for `re.VERBOSE`, `(?s)` for `re.DOTALL`, `(?m)` for `re.MULTILINE`, etc.

If the regex pattern is invalid, the student's answer is graded as incorrect.

## Using multiline inputs

Note that, in multiline inputs, it can be hard to distinguish between inputs with or without a terminating line break (i.e., an additional "Enter" at the end of the input). Because of that, you are strongly encouraged to leave the default setting of `remove-leading-trailing="true"` unchanged when using multiline inputs.

Additionally, multiline inputs will have any CR LF (`"\r\n"` in Python) line breaks normalized to a single LF (a single `"\n"` in Python). Note that this is different from the behavior of a standard `textarea` HTML element.

## Example implementations

- [element/stringInput]

## See also

- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-number-input` for numeric input](pl-number-input.md)

---

[element/stringinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/stringInput

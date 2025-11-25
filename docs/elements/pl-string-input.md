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
| `answers-name`            | string                  | —               | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.      |
| `weight`                  | integer                 | 1               | Weight to use when computing a weighted average score over elements.                                                                                                      |
| `correct-answer`          | string                  | See description | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`.                                                                                          |
| `label`                   | string                  | —               | A prefix to display before the input box (e.g., `label="$x =$"`).                                                                                                         |
| `aria-label`              | string                  | —               | An accessible label for the element.                                                                                                                                      |
| `suffix`                  | string                  | —               | A suffix to display after the input box (e.g., `suffix="items"`).                                                                                                         |
| `display`                 | `"block"` or `"inline"` | `"inline"`      | How to display the input field. Default is `"block"` if `multiline` is enabled.                                                                                           |
| `remove-leading-trailing` | boolean                 | false           | Whether to remove leading and trailing blank spaces from the input string.                                                                                                |
| `remove-spaces`           | boolean                 | false           | Whether to remove blank spaces from the input string.                                                                                                                     |
| `allow-blank`             | boolean                 | false           | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format).                                                                 |
| `ignore-case`             | boolean                 | false           | Whether to enforce case sensitivity (e.g. "hello" != "HELLO").                                                                                                            |
| `normalize-to-ascii`      | boolean                 | false           | Whether non-English characters (accents, non-latin alphabets, fancy quotes) should be normalized to equivalent English characters before submitting the file for grading. |
| `placeholder`             | string                  | —               | Hint displayed inside the input box describing the expected type of input.                                                                                                |
| `size`                    | integer                 | 35              | Width of the input box.                                                                                                                                                   |
| `show-help-text`          | boolean                 | true            | Show the question mark at the end of the input displaying required input parameters.                                                                                      |
| `multiline`               | boolean                 | false           | Whether or not to allow for multiline input using a `textarea` display.                                                                                                   |

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

# `pl-integer-input` element

Fill in the blank field that requires an **integer** input.

## Sample element

![Screenshot of the pl-integer-input element](pl-integer-input.png)

```html title="question.html"
<pl-integer-input answers-name="int_value" label="$y =$"></pl-integer-input>
```

```python title="server.py"
import random

def generate(data):

    # Generate a random whole number
    x = random.randint(1, 10)

    # Answer to fill in the blank input
    data["correct_answers"]["int_value"] = x
```

## Customizations

| Attribute        | Type                    | Default         | Description                                                                                                                                                          |
| ---------------- | ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank`    | boolean                 | false           | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format).                                                            |
| `answers-name`   | string                  | —               | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. |
| `aria-label`     | string                  | —               | An accessible label for the element.                                                                                                                                 |
| `base`           | integer                 | 10              | The base used to parse and represent the answer, or the special value 0 (see below).                                                                                 |
| `blank-value`    | string                  | 0 (zero)        | Value to be used as an answer if element is left blank. Only applied if `allow-blank` is `true`. Must be `""` (empty string) or an integer.                          |
| `correct-answer` | string                  | See description | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`. If `base` is provided, then this answer must be given in the provided base.         |
| `display`        | `"block"` or `"inline"` | `"inline"`      | How to display the input field.                                                                                                                                      |
| `initial-value`  | string                  | —               | Initial value to prefill the input box the first time it is rendered.                                                                                                |
| `label`          | string                  | —               | A prefix to display before the input box (e.g., `label="$x =$"`).                                                                                                    |
| `placeholder`    | string                  | See description | Custom placeholder text. If not set, defaults to `"integer"` if `base` is 10, otherwise `"integer in base <base>"`.                                                  |
| `show-help-text` | boolean                 | true            | Show the question mark at the end of the input displaying required input parameters.                                                                                 |
| `show-score`     | boolean                 | true            | Whether to show the score badge next to this element.                                                                                                                |
| `size`           | integer                 | 35              | Size of the input box.                                                                                                                                               |
| `suffix`         | string                  | —               | A suffix to display after the input box (e.g., `suffix="items"`).                                                                                                    |
| `weight`         | integer                 | 1               | Weight to use when computing a weighted average score over elements.                                                                                                 |

## Specifying a non-trivial base

By default, the values are interpreted in base 10. The `base` argument may also be used, with a value between 2 and 36, to indicate a different base to interpret the student input, as well as to print the final result.

The `base` argument can also accept a special value of 0. In this case, the values will by default be interpreted in base 10, however the student has the option of using different prefixes to indicate a value in a different format:

- The prefixes `0x` and `0X` can be used for base-16 values (e.g., `0x1a`);
- The prefixes `0b` and `0B` can be used for base-2 values (e.g., `0b1101`);
- The prefixes `0o` and `0O` can be used for base-8 values (e.g., `0o777`).

## Integer range

pl-integer-input can accept integers of unbounded size, however the correct answer will only be stored as the Python `int` if it is between -9007199254740991 and +9007199254740991 (between -(2^53 - 1) and +(2^53 - 1)). Otherwise, the correct answer will be stored as a string. This distinction is important in `server.py` scripts for `parse()` and `grade()`, as well as downloaded assessment results.

Note that answers can include underscores which are ignored (i.e., `1_000` will be parsed as `1000`).

## Example implementations

- [element/integerInput]

## See also

- [`pl-number-input` for numeric input](pl-number-input.md)
- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)
- [`pl-string-input` for string input](pl-string-input.md)

---

[element/integerinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/integerInput

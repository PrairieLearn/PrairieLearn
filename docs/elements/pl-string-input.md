# `pl-string-input` element

Fill-in-the-blank field that allows for **string**-value input, exact or pattern (regular expression).

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

| Attribute | Type | Default | Description |
| ------------------------- | ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank` | boolean | false | Whether an empty input box is allowed. By default, empty input boxes will not be graded (invalid format). |
| `answers-name` | string | — | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. |
| `aria-label` | string | — | An accessible label for the element. |
| `correct-answer` | string | See description | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`. |
| `correct-answer-format` | `"exact"` or `"regex"` | `"exact"` | If `"regex"`, `correct-answer` is interpreted as a whole-string regular-expression pattern, otherwise as a literal-string pattern. Inherits behavior of `ignore-case`. |
| `correct-answer-text` | string | — | A text string printed in the answer panel in place of the contents of `correct-answer`. Useful to provide a human-readable answer when `correct-answer-format="regex"`. |
| `display` | `"block"` or `"inline"` | `"inline"` | How to display the input field. Default is `"block"` if `multiline` is enabled. |
| `ignore-case` | boolean | false | Whether to enforce case sensitivity (e.g. "hello" != "HELLO"). |
| `initial-value` | string | — | Initial value is added to the text box the first time it is rendered. |
| `label` | string | — | A prefix to display before the input box (e.g., `label="$x =$"`). |
| `multiline` | boolean | false | Whether to allow for multiline input using a `textarea` display. |
| `normalize-to-ascii` | boolean | false | Whether non-English characters (accents, non-latin alphabets, fancy quotes) should be normalized to equivalent English characters before submitting the file for grading. |
| `placeholder` | string | — | Hint displayed inside the input box describing the expected type of input. |
| `remove-leading-trailing` | boolean | See description | Whether to remove leading and trailing blank spaces from the input string. Defaults to `true` if `multiline` is enabled, otherwise `false`. |
| `remove-spaces` | boolean | false | Whether to remove blank spaces from the input string. |
| `show-help-text` | boolean | true | Show the question mark at the end of the input displaying required input parameters. |
| `size` | integer | 35 | Width of the input box. |
| `suffix` | string | — | A suffix to display after the input box (e.g., `suffix="items"`). |
| `weight` | integer | 1 | Weight to use when computing a weighted average score over elements. |

### Flexible correct answers using regular expressions, `correct-answer-format="regex"`

By `correct-answer-format="regex"`, the whole correct answer is specified as an extended regular expression. This is a whole-answer match, not a substring match, equivalent to surrounding the answer pattern with `^(` ... `)$` (that is, the student's response is compared using Python's `re.fullmatch()`). Matching is case-sensitive or -insensitive depending on the value of the `ignore-case` attribute.

The pattern is an extended regular expression, with metacharacters `.`, `{`, `}`, `[`,`]`, `(`, `)`, `^`, `$`, `|`, `*`, `+`, `?`, and `\`. All other characters mean themselves literally. See the documentation for [Python regular expressions](https://docs.python.org/3/library/re.html).

Example.---To accept either `N`, or `nitrogen`, or any case variant thereof, but reject `Nitrate`:

```html title="question.html"
<pl-string-input
    answers-name="element"
    correct-answer="N|nitrogen"
    correct-answer-format="regex"
    remove-leading-trailing="true"
    correct-answer-text="Either 'N' or 'nitrogen'."
    ignore-case="true">
</pl-string-input>
```

Note (1) use of `ignore-case="true"` to accept `n`, `Nitrogen`, etc.; (2) `remove-leading-trailing="true"`; and (3) `correct-answer-text` for the answer panel substituting there for the regular expression itself.

Usage notes.---The `ignore-case` attribute enables Python's `re.IGNORECASE` in matching the pattern. 
Other matching behaviors can be coded into the regular expression; for example, `(?x)` to enable comments and to ignore whitespace (equivalent to `re.VERBOSE`), `(?s)` to match any character including newline with `.` (equivalent to `re.DOTALL`), `(?m)` to allow for matching `^` and `$` within the response (equivalent to `re.MULTILINE`), etc. 


Limitations.---As matching is whole-string, you need to include `.*` inside your pattern if you want to match a substring. If you want to match a literal `^` or `$`, you need to escape them as `\.`, `\$`, even though these metacharacters are useless within your pattern unless it contains `(?m)`. This mode's behavior does not change for `multiline="true"`. There is no access to Python flags as such beyond `re.IGNORECASE`. 

Bugs.---If the regular expression is invalid, the student's response is always graded as incorrect. This mode assumes that you know how to correctly write extended regular expressions.

### Simple answer-panel override using `correct-answer-text`

By default, the answer panel prints the contents of `correct-answer` as given. The attribute `correct-answer-text` provides a simple override (simpler than adjusting `<pl-answer-panel>`). This is useful, for example, in conjunction with a regular-expression answer to print a human-friendly key answer, as in the example.

## Using multiline inputs

Note that, in multiline inputs, it can be hard to distinguish between inputs with or without a terminating line break (i.e., an additional "Enter" at the end of the input). Because of that, you are strongly encouraged to leave the default setting of `remove-leading-trailing="true"` unchanged when using multiline inputs.

Additionally, multiline inputs will have any CR LF (`"\r\n"` in Python) line breaks normalized to a single LF (a single `"\n"` in Python). Note that this is different from the behavior of a standard `textarea` HTML element.

## Example implementations

- [element/stringInput]
- [template/string-input/regex]

## See also

- [`pl-symbolic-input` for mathematical expression input](pl-symbolic-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-number-input` for numeric input](pl-number-input.md)

______________________________________________________________________

[element/stringinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/stringInput
[template/string-input/regex]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/template/string-input/regex

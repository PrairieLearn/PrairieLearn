# `pl-checkbox` element

A `pl-checkbox` element displays a subset of the answers in a random order
as checkboxes.

## Sample element

![Screenshot of the pl-checkbox element](pl-checkbox.png)

```html title="question.html"
<pl-checkbox answers-name="vpos" weight="1">
  <pl-answer correct="true">A-B</pl-answer>
  <pl-answer correct="true">B-C</pl-answer>
  <pl-answer> C-D</pl-answer>
  <pl-answer correct="true">D-E</pl-answer>
  <pl-answer> E-F</pl-answer>
  <pl-answer> F-G</pl-answer>
</pl-checkbox>
```

## Customizations

| Attribute             | Type    | Default         | Description                                                                                                                                                                                                                          |
| --------------------- | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `answers-name`        | string  | —               | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                                                                 |
| `detailed-help-text`  | boolean | false           | Display the minimum and maximum number of options that can be selected in a valid submission. See explanation below.                                                                                                                 |
| `display`             | string  | `"block"`       | How to display answer choices: `"block"` (separate lines) or `"inline"` (single line).                                                                                                                                               |
| `hide-answer-panel`   | boolean | false           | Option to not display the correct answer in the correct panel.                                                                                                                                                                       |
| `hide-help-text`      | boolean | false           | Help text with hint regarding the selection of answers. Popover button describes the selected grading algorithm (`"off"`, `"coverage"`, `"each-answer"`, or `"net-correct"`).                                                        |
| `hide-letter-keys`    | boolean | false           | Hide the letter keys in the answer list, i.e., (a), (b), (c), etc.                                                                                                                                                                   |
| `hide-score-badge`    | boolean | false           | Hide badges next to selected answers.                                                                                                                                                                                                |
| `max-correct`         | integer | See description | The maximum number of correct answers to display. Defaults to displaying all correct answers.                                                                                                                                        |
| `max-select`          | integer | See description | The maximum number of answers that can be selected in any valid submission. Defaults to `max-correct` if that attribute is specified along with `detailed-help-text="true"`; otherwise, defaults to the number of displayed answers. |
| `min-correct`         | integer | See description | The minimum number of correct answers to display. Defaults to displaying all correct answers.                                                                                                                                        |
| `min-select`          | integer | See description | The minimum number of answers that must be selected in any valid submission. Defaults to `min-correct` if that attribute is specified along with `detailed-help-text="true"`; otherwise, defaults to 1.                              |
| `number-answers`      | integer | See description | The total number of answer choices to display. Defaults to displaying all answers.                                                                                                                                                   |
| `order`               | string  | `"random"`      | Order of answer choices: `"random"` (randomized) or `"fixed"` (as written).                                                                                                                                                          |
| `partial-credit`      | string  | `"off"`         | Grading method: `"off"` (all-or-nothing, default), `"net-correct"`, `"coverage"`, or `"each-answer"`.                                                                                                                                |
| `show-number-correct` | boolean | false           | Display the number of correct choices in the help text.                                                                                                                                                                              |
| `weight`              | integer | 1               | Weight to use when computing a weighted average score over elements.                                                                                                                                                                 |

Inside the `pl-checkbox` element, each choice must be specified with
a `pl-answer` that has attributes:

| Attribute  | Type    | Default | Description                                                                                                                                    |
| ---------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `correct`  | boolean | false   | Is this a correct answer to the question?                                                                                                      |
| `feedback` | string  | —       | Helper text (HTML) to be displayed to the student next to the option after question is graded if this option has been selected by the student. |

## Partial credit grading

Four grading methods are available using the `partial-credit` attribute:

- `"off"` (All-or-nothing, default): Students receive full credit only if they select all correct answers and no incorrect answers. Otherwise, they receive zero credit.

- `"net-correct"` (Net Correct): 1 point is added for each correct answer that is marked as correct and 1 point is subtracted for each incorrect answer that is marked as correct. The final score is the resulting summation of points divided by the total number of correct answers. The minimum final score is set to zero.

- `"coverage"` (Coverage): The final score is calculated by multiplying the **base score** (the proportion of correct answers that are chosen) with the **guessing factor** (the proportion of chosen answers that are correct). Specifically, if `t` is the number of correct answers chosen, `c` is the total number of correct answers, and `n` is the total number of answers chosen, then the final score is `(t / c) * (t / n)`. This grading scheme rewards submissions that include (i.e. "cover") all true options.

- `"each-answer"` (Every Decision Counts): The checkbox answers are considered as a list of true/false answers. If `n` is the total number of answers, each answer is assigned `1/n` points. The total score is the summation of the points for every correct answer selected and every incorrect answer left unselected.

### Migrating from deprecated attributes

The following deprecated attributes are still supported for backward compatibility:

| Old syntax                                          | New syntax                     |
| --------------------------------------------------- | ------------------------------ |
| `partial-credit="false"`                            | `partial-credit="off"`         |
| `partial-credit="true"`                             | `partial-credit="net-correct"` |
| `partial-credit="true" partial-credit-method="EDC"` | `partial-credit="each-answer"` |
| `partial-credit="true" partial-credit-method="COV"` | `partial-credit="coverage"`    |
| `inline="true"`                                     | `display="inline"`             |
| `fixed-order="true"`                                | `order="fixed"`                |

## Using the `detailed-help-text` attribute

The `detailed-help-text` attribute can be used with `min-correct` and/or `max-correct` to help students select the correct options. If `min-select` is not specified, then setting `detailed-help-text="true"` ensures that the number of selected options in a valid submission is at least the value of `min-correct`. Similarly, if `max-select` is not specified, then setting `detailed-help-text="true"` ensures that the number of selected options in a valid submission is at most the value of `max-correct`. For example, if a checkbox question does not specify `min-select` or `max-select`, and specifies `min-correct="2"`, `max-correct="4"`, and `detailed-help-text="true"`, then all valid submissions must select between 2 and 4 options. Thus, we help students by preventing them from selecting, say, five options. Indeed, if five options are selected, then at least one selected option is incorrect since there are at most four correct options.

Note that explicitly specifying `min-select` overrides the minimum number of options that must be selected, and similarly, explicitly specifying `max-select` overrides the maximum number of options that can be selected.

## Restricting the number of options that can be selected

The `min-select` and `max-select` attributes determine the minimum and maximum number of options that can be selected in a valid submission. The value of `min-select` is computed using the following steps:

1. If the `min-select` attribute is explicitly set, then we use the specified value of `min-select`.
2. If `min-select` is not specified, but `min-correct` is specified along with `detailed-help-text="true"`, then we use the specified value of `min-correct`.
3. If steps 1 and 2 do not apply, then we use a default value of 1.

To compute `max-select`, we use a similar algorithm (note the different default value in step 3):

1. If the `max-select` attribute is explicitly set, then we use the specified value of `max-select`.
2. If `max-select` is not specified, but `max-correct` is specified along with `detailed-help-text="true"`, then we use the specified value of `max-correct`.
3. If steps 1 and 2 do not apply, then `max-select` defaults to the number of displayed checkbox options (i.e. students can select all displayed options by default).

## Example implementations

- [element/checkbox]
- [demo/randomCheckbox]

## See also

- [`pl-multiple-choice` for allowing only **one** correct choice](pl-multiple-choice.md)

---

[demo/randomcheckbox]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomCheckbox
[element/checkbox]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/checkbox

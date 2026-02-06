# `pl-matching` element

Given a list of statements, select a matching option for each entry from a dropdown list.

## Sample element

![Screenshot of the pl-matching element](pl-matching.png)

```html title="question.html"
<pl-matching answers-name="string_value">
  <pl-statement match="Washington, D.C.">United States</pl-statement>
  <pl-statement match="Mexico City">Mexico</pl-statement>
  <pl-statement match="Paris">France</pl-statement>

  <pl-option>New York City</pl-option>
</pl-matching>
```

## Customizations

| Attribute             | Type                                                           | Default         | Description                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `allow-blank`         | boolean                                                        | false           | Whether a blank submission is allowed. If this is set to true, a statement that selects the blank entry will be marked as incorrect instead of invalid.                                                                  |
| `answers-name`        | string                                                         | —               | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                                                     |
| `blank`               | boolean                                                        | true            | Option to add blank dropdown entry as the default selection in each dropdown list.                                                                                                                                       |
| `counter-type`        | `"decimal"`, `"lower-alpha"`, `"upper-alpha"` or `"full-text"` | `"lower-alpha"` | The type of counter to use when enumerating the options. If set to `"full-text"`, the column of options will be hidden, and the text of each option will be used in the statements' dropdown lists, instead of counters. |
| `fixed-options-order` | boolean                                                        | false           | Whether to display the options in a fixed order; otherwise they are shuffled. See the details of `pl-option` below for more information on option ordering.                                                              |
| `fixed-order`         | boolean                                                        | false           | Whether to display the statements in a fixed order; otherwise they are shuffled.                                                                                                                                         |
| `hide-score-badge`    | boolean                                                        | false           | Whether to hide the correct/incorrect score badge next to each graded answer choice.                                                                                                                                     |
| `none-of-the-above`   | boolean                                                        | false           | Whether to add a "None of the above" to the end of the options.                                                                                                                                                          |
| `number-options`      | integer                                                        | See description | The number of options to display. Defaults to all options. The `none-of-the-above` option does not count towards this number.                                                                                            |
| `number-statements`   | integer                                                        | See description | The number of statements to display. Defaults to all statements.                                                                                                                                                         |
| `options-placement`   | `"right"` or `"bottom"`                                        | `"right"`       | The placement of options relative to the statements in order to make it visually cohesive. Especially useful when dealing with long statements or options.                                                               |
| `weight`              | integer                                                        | 1               | Weight to use when computing a weighted average score over elements.                                                                                                                                                     |

Inside the `pl-matching` element, a series of `pl-statement` and `pl-option` elements specify the questions the student must answer and the options to which they can be matched, respectively. Statements are displayed in the left column, and options in the right.

A total of `number-statements` statements will be randomly selected and displayed to the student. The corresponding matching options will be gathered; if `number-options` is larger than the number of options used by the selected statements, then random distractors will be selected from the remaining unused options. If the selected statements require more options than `number-options`, then `none-of-the-above` will automatically be set to true.

The content of a `pl-statement` can be any HTML element, including other PrairieLearn elements. A `pl-statement` must be specified with these attributes:

| Attribute | Type   | Default | Description                                                                                                                                                                                                                                                         |
| --------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match`   | string | —       | Identifies the option as the correct response for this `pl-statement`. If `match` corresponds to the `name` of any `pl-option` element, the statement will be linked to that `pl-option`, otherwise a new option is implicitly created based on this `match` value. |

The content of a `pl-option` can be any HTML element, including other PrairieLearn elements. `pl-option` elements are optional; options are created by default based on the `match` attribute of each `pl-statement`. Additional `pl-option` elements can be added to serve as distractors, or to render formatted HTML/PrairieLearn elements instead of plain text.

When the `fixed-options-order` feature is used, options are shown in the following order:

1. Any explicitly-defined `pl-option` elements are shown first, in the order they are declared.
2. Any implicitly-defined options defined by a `pl-statement` `match` attribute are shown next, in the order they are declared.

!!! warning

    While it is possible to use implicit options from the `match` attribute of each `pl-statement` without defining any `pl-option` elements, it is recommended to define `pl-option` elements explicitly in the following cases:

    * To define distractor options that are not the correct answer to any statement (an option that is always incorrect, such as "New York City" in the example above).
    * When the option text is longer than a few words, or requires formatting (e.g., mathematical expressions, code, images, etc.). In such cases, the `pl-option` name is used to identify the correct answer, while the content of the `pl-option` element is used to display the option text. The use of `counter-type="full-text"` is not recommended in this case.
    * When using `fixed-options-order="true"` to ensure the order of options is exactly as intended.
    * When the statements and options are generated dynamically in `server.py`, to ensure that the correct options are always available.

    Explicit options may be defined as the example below. Note that the `name` attribute is used to link the option to a statement's `match` attribute.

    ```html
    <pl-matching answers-name="string_value">
      <pl-statement match="golden">$\Phi$</pl-statement>
      <pl-statement match="e">$e$</pl-statement>
      <pl-statement match="i">$i$</pl-statement>
      <pl-option name="golden">$\frac{1+\sqrt{5}}{2}$</pl-option>
      <pl-option name="e">$\lim_{n \to \infty} \left(1 + \frac{1}{n}\right)^{n}$</pl-option>
      <pl-option name="i">$\sqrt{-1}$</pl-option>
    </pl-matching>
    ```

A `pl-option` must be specified with these attributes:

| Attribute | Type   | Default         | Description                                                                                                                 |
| --------- | ------ | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `name`    | string | See description | A key used to match this option as the correct response to a `pl-statement`. Defaults to the inner HTML of the `pl-option`. |

## Example implementations

- [element/matching]

---

[element/matching]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/matching

# `pl-dropdown` element

!!! warning

    Instructors are strongly encouraged to avoid `pl-dropdown` in newer questions. For questions with a single dropdown, a better alternative is to use [`pl-multiple-choice`](pl-multiple-choice.md), setting the attribute `display="dropdown"`. Using the multiple choice element provides better support for formatted option text (including Math formulas), randomized selection and ordering of options (both correct options and distractors) and partial scores for distractors. For questions using multiple dropdowns with the same set of options, the [`pl-matching`](pl-matching.md) element provides a better user experience and interface.

Select the correct answer from a drop-down **select** menu list of potential answers. The potential options are listed in the inner HTML of a `<pl-answer></pl-answer>` element (e.g. `<pl-answer>Possible Answer 1</pl-answer>`).

## Sample element

![Screenshot of the pl-dropdown element](pl-dropdown.png)

```html title="question.html"
<p>Select the correct word in the following quotes:</p>
The
<pl-dropdown answers-name="aristotle" blank="true">
  {{#params.aristotle}}
  <pl-answer correct="{{tag}}">{{ans}}</pl-answer>
  {{/params.aristotle}}
</pl-dropdown>
is more than the sum of its parts.
<p></p>

A
<pl-dropdown sort="ascend" answers-name="hume">
  <pl-answer correct="true">wise</pl-answer>
  <pl-answer correct="false">clumsy</pl-answer>
  <pl-answer correct="false">reckless</pl-answer>
</pl-dropdown>
man proportions his belief to the evidence.
<p></p>
```

```python title="server.py"
def generate(data):

    QUESTION1 = "aristotle"

    data["params"][QUESTION1] = [
        {"tag": "true", "ans": "whole"},
        {"tag": "false", "ans": "part"},
        {"tag": "false", "ans": "inverse"}
    ]
```

## Customizations

| Attribute      | Type    | Default | Description                                                                                                                                                          |
| -------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-blank`  | boolean | false   | Whether an empty submission is allowed. By default, empty dropdowns will not be graded (invalid format).                                                             |
| `answers-name` | string  | —       | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. |
| `aria-label`   | string  | None    | An accessible label for the element.                                                                                                                                 |
| `blank`        | boolean | true    | Option to add blank dropdown entry as default selection in drop-down list.                                                                                           |
| `sort`         | string  | random  | Options are 'random', 'ascend', and 'descend', and 'fixed' for drop-down answers.                                                                                    |
| `weight`       | integer | 1       | Weight to use when computing a weighted average score over elements.                                                                                                 |

## Example implementation

- [demo/overlayDropdown]
- [element/dropdown]

---

[demo/overlaydropdown]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/overlayDropdown
[element/dropdown]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/dropdown

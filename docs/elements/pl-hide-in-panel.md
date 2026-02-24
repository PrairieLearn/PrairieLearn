# `pl-hide-in-panel` element

Hide the contents so that it is **not** displayed in specific panels ("question", "submission", or "answer").

## Sample element

```html title="question.html"
<pl-hide-in-panel submission="true" answer="true">
  This text will be hidden in the submission panel and answer panel.
</pl-hide-in-panel>
```

## Customizations

| Attribute    | Type    | Default | Description                                                   |
| ------------ | ------- | ------- | ------------------------------------------------------------- |
| `answer`     | boolean | false   | Whether to hide the element contents in the answer panel.     |
| `question`   | boolean | false   | Whether to hide the element contents in the question panel.   |
| `submission` | boolean | false   | Whether to hide the element contents in the submission panel. |

## Details

Hide the element contents in those panels for which the corresponding
attribute is `true`. This is the reverse of
[`pl-question-panel`](pl-question-panel.md),
[`pl-submission-panel`](pl-submission-panel.md), or
[`pl-answer-panel`](pl-answer-panel.md), all of which explicitly show the
element contents only in a specific panel.

## Example implementations

- [element/panels]

## See also

- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-answer-panel` for displaying the question's solution.](pl-answer-panel.md)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](pl-external-grader-results.md)

---

[element/panels]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/panels

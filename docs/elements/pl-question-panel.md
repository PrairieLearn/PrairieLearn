# `pl-question-panel` element

Displays the contents of question directions.

## Sample element

```html title="question.html"
<pl-question-panel>This content is only shown in the question panel.</pl-question-panel>
```

## Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the submission panel and
answer panel (so, only in the question panel), surround that content
with the `<pl-question-panel>` tags.

## Example implementations

- [demo/calculation]

## See also

- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-answer-panel` for displaying the question's solution.](pl-answer-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)

---

[demo/calculation]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/calculation

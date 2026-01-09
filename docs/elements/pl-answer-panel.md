# `pl-answer-panel` element

Provide information regarding the question answer after the student is unable
to submit further answers for grading.

## Sample element

```html
<pl-answer-panel>This content is only shown in the answer panel.</pl-answer-panel>
```

## Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the submission panel and
question panel (so, only in the answer panel), surround that content
with the `<pl-answer-panel>` tags.

Common reasons that trigger the display of the answer panel are:

- The question is fully correct.
- There are no more submission attempts.
- The time limit for the assessment has expired.

## Example implementations

- [demo/custom/gradeFunction]

## See also

- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](pl-external-grader-results.md)

---

[demo/custom/gradefunction]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/custom/gradeFunction

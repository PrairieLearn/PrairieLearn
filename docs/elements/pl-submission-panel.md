# `pl-submission-panel` element

Customizes how information entered by a user is displayed before grading.

## Sample element

```html title="question.html"
<pl-submission-panel>This content is only shown in the submission panel.</pl-submission-panel>
```

## Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the question panel and
answer panel (so, only in the submission panel), surround that content
with the `<pl-submission-panel>` tags.

The submission panel is only shown after the student has submitted an
answer. This answer may be correct, incorrect, or invalid.

## Example implementations

- [demo/custom/gradeFunction]
- [demo/autograder/codeUpload]
- [demo/autograder/codeEditor]

## See also

- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-answer-panel` for displaying the question's solution.](pl-answer-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](pl-external-grader-results.md)

---

## Deprecated Elements

!!! note

    The following PrairieLearn Elements have been **deprecated**. These elements are still supported for backwards compatibility, but they should not be used in new questions.

[demo/autograder/codeeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeEditor
[demo/autograder/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeUpload
[demo/custom/gradefunction]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/custom/gradeFunction

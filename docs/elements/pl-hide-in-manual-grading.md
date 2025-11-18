### `pl-hide-in-manual-grading` element

Hide the contents so that it is **not** displayed to graders in the manual grading page.

#### Sample element

```html
<pl-hide-in-manual-grading>
  This text will be shown to students, but not to graders.
</pl-hide-in-manual-grading>
```

#### Details

This element is typically used to abbreviate the question description and allow graders to focus on the actual answers during grading. It is the reverse of [the `pl-manual-grading-only` element](pl-manual-grading-only.md), which explicitly shows content only during grading.

#### Example implementations

- [demo/manualGrade/codeUpload]

#### See also

- [`pl-manual-grading-only` to show content only during manual grading.](pl-manual-grading-only.md)
- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-answer-panel` for displaying the question's solution.](pl-answer-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)

---

[demo/manualgrade/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/manualGrade/codeUpload

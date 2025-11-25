# `pl-manual-grading-only` element

Hide the contents so that it is **only** displayed to graders in the manual grading page.

## Sample element

```html title="question.html"
<pl-manual-grading-only>
  This text will be shown to graders, but not to students.
</pl-manual-grading-only>
```

## Details

This element is typically used to provide graders with additional information that may not be presented to students. Examples may include grading instructions, sample answers, acceptable values for individual results, random parameters used in the question generation, or pre-computed values calculated in explicit `parse` functions. It is the reverse of [the `pl-hide-in-manual-grading` element](pl-hide-in-manual-grading.md), which explicitly hides content during grading.

## Example implementations

- [demo/manualGrade/codeUpload]

## See also

- [`pl-hide-in-manual-grading` to hide content during manual grading.](pl-hide-in-manual-grading.md)
- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-answer-panel` for displaying the question's solution.](pl-answer-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)

---

[demo/manualgrade/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/manualGrade/codeUpload

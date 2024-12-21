- [`pl-answer-panel`](#pl-answer-panel-element): Displays the correct
  answer to a given question.
- [`pl-external-grader-results`](#pl-external-grader-results-element):
  Displays results from questions that are externally graded.
- [`pl-hide-in-panel`](#pl-hide-in-panel-element): Hides content in one or more display panels.
- [`pl-hide-in-manual-grading`](#pl-hide-in-manual-grading-element): Hides content in the manual grading page.
- [`pl-hidden-hints`](#pl-hidden-hints-element): Displays hints as a student submits more on the current variant.
- [`pl-manual-grading-only`](#pl-manual-grading-only-element): Shows content only in manual grading.
- [`pl-question-panel`](#pl-question-panel-element): Displays the text of a
  question.
- [`pl-submission-panel`](#pl-submission-panel-element): Displays the answer
  given by the student.

### `pl-answer-panel` element

Provide information regarding the question answer after the student is unable
to submit further answers for grading.

#### Sample element

```html
<pl-answer-panel>This content is only shown in the answer panel.</pl-answer-panel>
```

#### Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the submission panel and
question panel (so, only in the answer panel), surround that content
with the `<pl-answer-panel>` tags.

Common reasons that trigger the display of the answer panel are:

- The question is fully correct.
- There are no more submission attempts.
- The time limit for the assessment has expired.

#### Example implementations

- [demo/custom/gradeFunction]

#### See also

- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](#pl-external-grader-results-element)

---

### `pl-external-grader-results` element

Displays results from externally-graded questions.

#### Sample element

```html
<pl-external-grader-results></pl-external-grader-results>
```

#### Details

It expects results to follow [the reference schema for external grading results](../externalGrading.md#grading-results).

#### Example Implementations

- [demo/autograder/codeUpload]
- [demo/autograder/codeEditor]

#### See also

- [External Grading Reference Schema](../externalGrading.md#grading-results)

---

### `pl-hide-in-panel` element

Hide the contents so that it is **not** displayed in specific panels ("question", "submission", or "answer").

#### Sample element

```html
<pl-hide-in-panel submission="true" answer="true">
  This text will be hidden in the submission panel and answer panel.
</pl-hide-in-panel>
```

#### Customizations

| Attribute    | Type    | Default | Description                                                   |
| ------------ | ------- | ------- | ------------------------------------------------------------- |
| `question`   | boolean | false   | Whether to hide the element contents in the question panel.   |
| `submission` | boolean | false   | Whether to hide the element contents in the submission panel. |
| `answer`     | boolean | false   | Whether to hide the element contents in the answer panel.     |

#### Details

Hide the element contents in those panels for which the corresponding
attribute is `true`. This is the reverse of
[`pl-question-panel`](#pl-question-panel-element),
[`pl-submission-panel`](#pl-submission-panel-element), or
[`pl-answer-panel`](#pl-answer-panel-element), all of which explicitly show the
element contents only in a specific panel.

#### Example implementations

- [element/panels]

#### See also

- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-answer-panel` for displaying the question's solution.](#pl-answer-panel-element)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](#pl-external-grader-results-element)

---

### `pl-hide-in-manual-grading` element

Hide the contents so that it is **not** displayed to graders in the manual grading page.

#### Sample element

```html
<pl-hide-in-manual-grading>
  This text will be shown to students, but not to graders.
</pl-hide-in-manual-grading>
```

#### Details

This element is typically used to abbreviate the question description and allow graders to focus on the actual answers during grading. It is the reverse of [the `pl-manual-grading-only` element](#pl-manual-grading-only-element), which explicitly shows content only during grading.

#### Example implementations

- [demo/manualGrade/codeUpload]

#### See also

- [`pl-manual-grading-only` to show content only during manual grading.](#pl-manual-grading-only-element)
- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-answer-panel` for displaying the question's solution.](#pl-answer-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)

---

### `pl-hidden-hints` element

Display progressive hints that become accessible as the number of student submissions increases for the current variant.
Hints are only open on page load when they are first revealed (when first reaching the desired submission count).
Otherwise hints start closed and must be opened by the user. The submission counter is reset when new variants are
generated. Note that **this element does not reveal new hints across variants.**

Best used in situations where there is a penalty for more submissions to a given variant. This prevents students from
spamming incorrect submissions to reveal all hints right away.

#### Sample element

```html
<pl-hidden-hints>
  <pl-hint> This is a hint that will be accessible immediately. </pl-hint>

  <pl-hint show-after-submission="3">
    This is a hint that will be accessible after three incorrect submissions for the current
    variant.
  </pl-hint>

  <pl-hint show-after-submission="5">
    This is a hint that will be accessible after five incorrect submissions for the current variant.
  </pl-hint>
</pl-hidden-hints>
```

#### Customizations

For the inner `pl-hint` tag:

| Attribute               | Type   | Default | Description                                                                                                                                                                                                 |
| ----------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show-after-submission` | int    | -       | Number of submissions on the current variant needed before the hint is accessible. If not set, hint is always accessible. **Should only be set for questions that allow multiple submissions per variant.** |
| `hint-name`             | string | -       | Custom heading to display for the given hint. If not set, then displays a default heading including the hint number.                                                                                        |

#### Details

Add hints to a variant that are revealed with more submissions using the `show-after-submission` attribute. By default, hints without
`show-after-submission` set are always shown. Hints with the same `show-after-submission` appear in the order they're written in the
question HTML.

#### Example implementations

- [element/hiddenHints]

#### See also

- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)

---

### `pl-manual-grading-only` element

Hide the contents so that it is **only** displayed to graders in the manual grading page.

#### Sample element

```html
<pl-manual-grading-only>
  This text will be shown to graders, but not to students.
</pl-manual-grading-only>
```

#### Details

This element is typically used to provide graders with additional information that may not be presented to students. Examples may include grading instructions, sample answers, acceptable values for individual results, random parameters used in the question generation, or pre-computed values calculated in explicit `parse` functions. It is the reverse of [the `pl-hide-in-manual-grading` element](#pl-hide-in-manual-grading-element), which explicitly hides content during grading.

#### Example implementations

- [demo/manualGrade/codeUpload]

#### See also

- [`pl-hide-in-manual-grading` to hide content during manual grading.](#pl-hide-in-manual-grading-element)
- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-answer-panel` for displaying the question's solution.](#pl-answer-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)

---

### `pl-question-panel` element

Displays the contents of question directions.

#### Sample element

```html
<pl-question-panel>This content is only shown in the question panel.</pl-question-panel>
```

#### Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the submission panel and
answer panel (so, only in the question panel), surround that content
with the `<pl-question-panel>` tags.

#### Example implementations

- [demo/calculation]

#### See also

- [`pl-submission-panel` for changing how a submitted answer is displayed.](#pl-submission-panel-element)
- [`pl-answer-panel` for displaying the question's solution.](#pl-answer-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)

---

### `pl-submission-panel` element

Customizes how information entered by a user is displayed before grading.

#### Sample element

```html
<pl-submission-panel>This content is only shown in the submission panel.</pl-submission-panel>
```

#### Details

Generally, the contents of `question.html` will appear in
the question panel, submission panel, and answer panel. To prevent
content from being displayed in the question panel and
answer panel (so, only in the submission panel), surround that content
with the `<pl-submission-panel>` tags.

The submission panel is only shown after the student has submitted an
answer. This answer may be correct, incorrect, or invalid.

#### Example implementations

- [demo/custom/gradeFunction]
- [demo/autograder/codeUpload]
- [demo/autograder/codeEditor]

#### See also

- [`pl-question-panel` for displaying the question prompt.](#pl-question-panel-element)
- [`pl-answer-panel` for displaying the question's solution.](#pl-answer-panel-element)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](#pl-hide-in-panel-element)
- [`pl-external-grader-results` for showing the results from an externally graded code question.](#pl-external-grader-results-element)

---

::: pl-answer-panel.pl-answer-panel

{!elements/reference-links.md!}

# `pl-hidden-hints` element

Display progressive hints that become accessible as the number of student submissions increases for the current variant.
Hints are only open on page load when they are first revealed (when first reaching the desired submission count).
Otherwise, hints start closed and must be opened by the user. The submission counter is reset when new variants are
generated. Note that **this element does not reveal new hints across variants.**

Best used in situations where there is a penalty for more submissions to a given variant. This prevents students from
spamming incorrect submissions to reveal all hints right away.

## Sample element

```html title="question.html"
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

## Customizations

For the inner `pl-hint` tag:

| Attribute               | Type   | Default | Description                                                                                                                                                                                                 |
| ----------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hint-name`             | string | —       | Custom heading to display for the given hint. If not set, then displays a default heading including the hint number.                                                                                        |
| `show-after-submission` | int    | —       | Number of submissions on the current variant needed before the hint is accessible. If not set, hint is always accessible. **Should only be set for questions that allow multiple submissions per variant.** |

## Details

Add hints to a variant that are revealed with more submissions using the `show-after-submission` attribute. By default, hints without
`show-after-submission` set are always shown. Hints with the same `show-after-submission` appear in the order they're written in the
question HTML.

## Example implementations

- [element/hiddenHints]

## See also

- [`pl-question-panel` for displaying the question prompt.](pl-question-panel.md)
- [`pl-submission-panel` for changing how a submitted answer is displayed.](pl-submission-panel.md)
- [`pl-hide-in-panel` to hide contents in one or more display panels.](pl-hide-in-panel.md)

---

[element/hiddenhints]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/hiddenHints

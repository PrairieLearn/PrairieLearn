### `pl-multiple-choice` element

A `pl-multiple-choice` element selects **one** correct answer and zero or more
incorrect answers and displays them in a random order as radio buttons.
Duplicate answer choices (string equivalents) are not permitted in the
`pl-multiple-choice` element, and an exception will be raised upon question
generation if two (or more) choices are identical.

#### Sample element

![Screenshot of the pl-multiple-choice element](pl-multiple-choice.png)

```html title="question.html"
<pl-multiple-choice answers-name="acc" weight="1">
  <pl-answer correct="false">positive</pl-answer>
  <pl-answer correct="true">negative</pl-answer>
  <pl-answer correct="false">zero</pl-answer>
</pl-multiple-choice>
```

#### Customizations

| Attribute                    | Type                                                 | Default                     | Description                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `answers-name`               | string                                               | —                           | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                       |
| `weight`                     | integer                                              | 1                           | Weight to use when computing a weighted average score over elements.                                                                                                                       |
| `display`                    | `"block"`, `"inline"`, or `"dropdown"`               | `"block"`                   | Display option for the input field. Block and inline display answer choices as radio buttons, while dropdown presents option as a dropdown.                                                |
| `number-answers`             | integer                                              | See description             | The total number of answer choices to display. Defaults to displaying one correct answer and all incorrect answers.                                                                        |
| `order`                      | `"random"`, `"ascend"`, `"descend"`, or `"fixed"`    | `"random"`                  | Order to display answer choices. Fixed order displays choices in the same order as the original source file.                                                                               |
| `hide-letter-keys`           | boolean                                              | false                       | Hide the letter keys in the answer list, i.e., (a), (b), (c), etc.                                                                                                                         |
| `all-of-the-above`           | `"false"`, `"random"`, `"correct"`, or `"incorrect"` | `"false"`                   | Add `"All of the above"` choice. See below for details.                                                                                                                                    |
| `none-of-the-above`          | `"false"`, `"random"`, `"correct"`, or `"incorrect"` | `"false"`                   | Add `"None of the above"` choice. See below for details.                                                                                                                                   |
| `all-of-the-above-feedback`  | string                                               | —                           | Helper text to be displayed to the student next to the `all-of-the-above` option after question is graded if this option has been selected by the student.                                 |
| `none-of-the-above-feedback` | string                                               | —                           | Helper text to be displayed to the student next to the `none-of-the-above` option after question is graded if this option has been selected by the student.                                |
| `allow-blank`                | boolean                                              | false                       | Whether an empty submission is allowed. If `allow-blank` is set to `true`, a submission that does not select any option will be marked as incorrect instead of invalid.                    |
| `size`                       | integer                                              | —                           | Manually set the size of the dropdown to a fixed width. The default behavior is to make the dropdown as wide as the widest option. Should only be used with `display` set to `"dropdown"`. |
| `placeholder`                | string                                               | `"Select an option"`        | String to be used as the placeholder text when `display` is set to `"dropdown"`. Will also accept an empty string as `placeholder=""`.                                                     |
| `aria-label`                 | string                                               | `"Multiple choice options"` | An accessible label for the element.                                                                                                                                                       |

The attributes `none-of-the-above` and `all-of-the-above` can be set to one of these values:

- `"false"`: the corresponding choice will not be shown in the list of choices. This is the default.
- `"random"`: the corresponding choice will always be shown, and will be randomly correct, with probability proportional to the total number of correct choices. In other words, if there are `N` possible correct choices in total, this choice will be correct with probability `1/N`.
- `"correct"`: the corresponding choice will always be shown and will always be the correct answer.
- `"incorrect"`: the corresponding choice will always be shown and will always be an incorrect answer (i.e., a distractor).

##### :pencil: Notes

- "All of the above" and "None of the above", if set, are bounded by the `number-answers` value above. Also, these two values are always shown as the last choices, regardless of the setting for `order`. If both choices are shown, then "All of the above" will be listed before "None of the above".
- Defining answer choices with external JSON files via the `external-json` attribute is now deprecated.

Inside the `pl-multiple-choice` element, each choice must be specified with
a `pl-answer` that has attributes:

| Attribute  | Type    | Default         | Description                                                                                                                                    |
| ---------- | ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `correct`  | boolean | false           | Is this a correct answer to the question?                                                                                                      |
| `feedback` | string  | —               | Helper text (HTML) to be displayed to the student next to the option after question is graded if this option has been selected by the student. |
| `score`    | float   | See description | Score given to answer choice if selected by student. Defaults to 1.0 for correct answers and 0.0 for incorrect answers.                        |

#### Example implementations

- [element/multipleChoice]
- [demo/randomMultipleChoice]

#### See also

- [`pl-checkbox` for allowing **one or more** choices](pl-checkbox.md)



<!-- Reference style links for element implementations -->

<!-- External Grade Questions -->

[demo/autograder/codeeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeEditor
[demo/autograder/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeUpload
[demo/autograder/python/square]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/square
[demo/autograder/python/numpy]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/numpy
[demo/autograder/python/pandas]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/pandas
[demo/autograder/python/plots]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/plots
[demo/autograder/python/random]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/random
[demo/autograder/python/orderblocksrandomparams]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/orderBlocksRandomParams
[demo/autograder/python/orderblocksaddnumpy]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/python/orderBlocksAddNumpy

<!-- Manual grading examples -->

[demo/manualgrade/codeupload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/manualGrade/codeUpload

<!-- High quality questions -->

[demo/calculation]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/calculation
[demo/fixedcheckbox]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/fixedCheckbox
[demo/markdowneditorlivepreview]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/markdownEditorLivePreview
[demo/matrixcomplexalgebra]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/matrixComplexAlgebra
[demo/overlaydropdown]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/overlayDropdown
[demo/randomcheckbox]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomCheckbox
[demo/randomdataframe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomDataFrame
[demo/randommultiplechoice]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomMultipleChoice
[demo/randomplot]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomPlot
[demo/proofblocks]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/proofBlocks

<!-- Element option overview questions -->

[element/checkbox]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/checkbox
[element/bigoinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/bigOInput
[element/hiddenhints]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/hiddenHints
[element/code]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/code
[element/dropdown]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/dropdown
[element/excalidraw]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/excalidraw
[element/figure]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/figure
[element/filedownload]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/fileDownload
[element/fileeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/fileEditor
[element/graph]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/graph
[element/imageCapture]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/imageCapture
[element/integerinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/integerInput
[element/matching]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/matching
[element/matrixcomponentinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/matrixComponentInput
[element/matrixlatex]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/matrixLatex
[element/multiplechoice]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/multipleChoice
[element/numberinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/numberInput
[element/unitsinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/unitsInput
[element/orderblocks]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/orderBlocks
[element/orderblocksoptional]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/orderBlocksOptional
[element/overlay]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/overlay
[element/panels]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/panels
[element/prairiedrawfigure]: https://github.com/PrairieLearn/PrairieLearn/tree/master/testCourse/questions/prairieDrawFigure
[element/pythonvariable]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/pythonVariable
[element/dataframe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/dataframe
[element/richTextEditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/richTextEditor
[element/stringinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/stringInput
[element/symbolicinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/symbolicInput
[element/template]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/template
[element/variableoutput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/variableOutput
[element/xsssafe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/xssSafe
[element/card]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/card

<!-- Advanced uses of PL features -->

[demo/custom/gradefunction]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/custom/gradeFunction

<!-- Misc application questions -->

### `pl-variable-score` element

Display the partial score for a specific answer variable.

!!! warning

    This element is **deprecated** and should not be used in new questions.

#### Sample element

```html title="question.html"
<pl-variable-score answers-name="v_avg"></pl-variable-score>
```

#### Customizations

| Attribute      | Type   | Default | Description                         |
| -------------- | ------ | ------- | ----------------------------------- |
| `answers-name` | string | —       | Variable name to display score for. |

---

### `pl-symbolic-input` element

Fill in the blank field that allows for mathematical symbol input.

#### Sample element

![Screenshot of the pl-symbolic-input element](pl-symbolic-input.png)

```html title="question.html"
<pl-symbolic-input answers-name="symbolic_math" variables="x, y" label="$z =$"></pl-symbolic-input>
```

```python title="server.py"
import prairielearn as pl
import sympy

def generate(data):

    # Declare math symbols
    x, y = sympy.symbols("x y")

    # Describe the equation
    z = x + y + 1

    # Answer to fill in the blank input stored as JSON.
    data["correct_answers"]["symbolic_math"] = pl.to_json(z)
```

#### Customizations

| Attribute                       | Type                    | Default                 | Description                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers-name`                  | string                  | —                       | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. If the correct answer is set in `server.py` as a complex object, you should use `import prairielearn as pl` and `data["correct_answers"][answers-name] = pl.to_json(ans)`. |
| `weight`                        | integer                 | 1                       | Weight to use when computing a weighted average score over elements.                                                                                                                                                                                                                                                                            |
| `correct-answer`                | string                  | See description         | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`.                                                                                                                                                                                                                                                                |
| `label`                         | string                  | —                       | A prefix to display before the input box (e.g., `label="$F =$"`).                                                                                                                                                                                                                                                                               |
| `aria-label`                    | string                  | —                       | An accessible label for the element.                                                                                                                                                                                                                                                                                                            |
| `display`                       | `"block"` or `"inline"` | `"inline"`              | How to display the input field.                                                                                                                                                                                                                                                                                                                 |
| `formula-editor`                | boolean                 | false                   | Whether the element should provide a visual formula editor for students (recommended when answers are long or contain nested mathematical expressions).                                                                                                                                                                                         |
| `variables`                     | string                  | —                       | A comma-delimited list of symbols that can be used in the symbolic expression.                                                                                                                                                                                                                                                                  |
| `allow-complex`                 | boolean                 | false                   | Whether complex numbers (expressions with `i` or `j` as the imaginary unit) are allowed.                                                                                                                                                                                                                                                        |
| `imaginary-unit-for-display`    | string                  | `"i"`                   | The imaginary unit that is used for display. It must be either `"i"` or `"j"`. Again, this is _only_ for display. Both `i` and `j` can be used by the student in their submitted answer, when `allow-complex="true"`.                                                                                                                           |
| `display-log-as-ln`             | boolean                 | `false`                 | Whether `ln` rather than `log` should be used when displaying submissions and correct answers. Both are considered equivalent and can be used by the student in their submitted answer.                                                                                                                                                         |
| `display-simplified-expression` | boolean                 | `true`                  | Whether expressions submitted by students should be displayed in their simplified form. Setting `display-simplified-expression="false"` can prevent unintended simplifications that might confuse students. Note that, regardless of this setting, answers are always simplified for grading purposes.                                          |
| `allow-trig-functions`          | boolean                 | true                    | Whether trigonometric functions (`cos`, `atanh`, ...) are allowed.                                                                                                                                                                                                                                                                              |
| `allow-blank`                   | boolean                 | false                   | Whether an empty input box is allowed. By default, an empty input box will not be graded (invalid format).                                                                                                                                                                                                                                      |
| `blank-value`                   | string                  | 0 (zero)                | Expression to be used as an answer if the answer is left blank. Only applied if `allow-blank` is `true`. Must be `""` (empty string) or follow the same format as an expected user input (e.g., same variables, etc.).                                                                                                                          |
| `size`                          | integer                 | 35                      | Size of the input box.                                                                                                                                                                                                                                                                                                                          |
| `show-help-text`                | boolean                 | true                    | Show the question mark at the end of the input displaying required input parameters.                                                                                                                                                                                                                                                            |
| `placeholder`                   | string                  | `"symbolic expression"` | Hint displayed inside the input box describing the expected type of input.                                                                                                                                                                                                                                                                      |
| `custom-functions`              | string                  | —                       | A comma-delimited list of custom functions that can be used in the symbolic expression.                                                                                                                                                                                                                                                         |
| `show-score`                    | boolean                 | true                    | Whether to show the score badge next to this element.                                                                                                                                                                                                                                                                                           |
| `suffix`                        | string                  | —                       | A suffix to display after the input box (e.g., `suffix="$\rm m/s^2$"`).                                                                                                                                                                                                                                                                         |

#### Details

Correct answers are best created as `sympy` expressions and converted to json using `pl.to_json`. It is also possible to specify the correct answer simply as a string, e.g., `x + y + 1`.

Variables with the same name as greek letters (e.g., `alpha`, `beta`, etc.) will be automatically converted to their LaTeX equivalents for display on the correct answer and submission panels.

Do not include `i` or `j` in the list of `variables` if `allow-complex="true"`, and do not include any other reserved name in your list of `variables` (`e`, `pi`, `cos`, `sin`, etc.). The element code will check for (and disallow) conflicts between your list of `variables`, `custom-functions`, and reserved names.

Note that variables created with additional assumptions in a correct answer will have those assumptions respected when evaluating student answers.
See example question for details.

#### Example implementations

- [element/symbolicInput]

#### See also

- [`pl-number-input` for numeric input](pl-number-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-string-input` for string input](pl-string-input.md)

---



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

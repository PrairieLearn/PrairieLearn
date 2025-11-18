### `pl-variable-output` element

Displays a list of variables that are formatted for import into the
supported programming languages (e.g. MATLAB, Mathematica, Python, or R).

#### Sample element

![Screenshot of the pl-variable-output element](pl-variable-output.png)

```html title="question.html"
<pl-variable-output digits="3">
  <!-- Example comment inside of this element. -->
  <pl-variable params-name="matrixC">C</pl-variable>
  <pl-variable params-name="matrixD">D</pl-variable>
</pl-variable-output>
```

```python title="server.py"
import prairielearn as pl
import numpy as np

def generate(data):

    # Create fixed matrix
    matrixC = np.matrix("5 6; 7 8")
    matrixD = np.matrix("-1 4; 3 2")
    # Random matrices can be generated with:
    # mat = np.random.random((2, 2))

    # Export each matrix as a JSON object for the question view.
    data["params"]["matrixC"] = pl.to_json(matrixC)
    data["params"]["matrixD"] = pl.to_json(matrixD)
```

#### Customizations

Attributes for `<pl-variable-output>`:

| Attribute          | Type                                                      | Default    | Description                                                          |
| ------------------ | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `digits`           | integer                                                   | —          | Number of digits to display after the decimal.                       |
| `default-tab`      | `"matlab"`, `"mathematica"`, `"python"`, `"r"`, `"sympy"` | `"matlab"` | Select the active tab.                                               |
| `show-matlab`      | boolean                                                   | true       | Toggles the display of the Matlab tab (also compatible with Octave). |
| `show-mathematica` | boolean                                                   | true       | Toggles the display of the Mathematica tab.                          |
| `show-python`      | boolean                                                   | true       | Toggles the display of the Python tab.                               |
| `show-r`           | boolean                                                   | true       | Toggles the display of the R tab.                                    |
| `show-sympy`       | boolean                                                   | true       | Toggles the display of the SymPy tab.                                |

Attributes for `<pl-variable>` (one of these for each variable to display):

| Attribute     | Type    | Default | Description                                                     |
| ------------- | ------- | ------- | --------------------------------------------------------------- |
| `params-name` | string  | —       | Name of variable in `data["params"]` to display.                |
| `comment`     | string  | —       | Comment to add after the displayed variable.                    |
| `digits`      | integer | —       | Number of digits to display after the decimal for the variable. |

#### Details

This element displays a list of variables inside `<pl-code>` tags that are formatted for import into
either MATLAB, Mathematica, Python, or R (the user can switch between them). Each variable must be
either a scalar or a 2D numpy array (expressed as a list). Each variable will be prefixed by the
text that appears between the `<pl-variable>` and `</pl-variable>` tags, followed by `=`. Below
are samples of the format displayed under each language tab.

**MATLAB format:**

```m
A = [1.23; 4.56]; % matrix
```

**Mathematica format:**

```mathematica
A = [1.23; 4.56]; (* matrix *)
```

**Python format:**

```python
import numpy as np

A = np.array([[1.23], [4.56]]) # matrix
```

**R format:**

```r
A = c(1.23, 4.56) # vector
A = matrix(c(1.23, 4.56, 8.90, 1.23), nrow = 2, ncol = 2, byrow = TRUE) # matrix
```

If a variable `v` is a complex object, you should use `import prairielearn as pl` and `data["params"][params-name] = pl.to_json(v)`.

#### Example implementations

- [element/variableOutput]
- [element/matrixComponentInput]
- [demo/matrixComplexAlgebra]

#### See also

- [`pl-matrix-latex` for displaying the matrix using LaTeX commands.](pl-matrix-latex.md)
- [`pl-matrix-component-input` for individual input boxes for each element in the matrix](pl-matrix-component-input.md)
- [`pl-matrix-input` for input values formatted in a supported programming language.](pl-matrix-input.md)
- [`pl-code` to display blocks of code with syntax highlighting](pl-code.md)

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

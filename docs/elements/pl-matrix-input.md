# `pl-matrix-input` element

A `pl-matrix-input` element displays an input field that accepts a matrix
(i.e., a 2-D array) expressed in a supported programming language
format (either MATLAB or Python's numpy).

## Sample element

![Screenshot of the pl-matrix-input element](pl-matrix-input.png)

```html title="question.html"
<pl-matrix-input answers-name="matrixB" label="$B=$"></pl-matrix-input>
```

```python title="server.py"
import prairielearn as pl
import numpy as np

def generate(data):
    # Randomly generate a 2x2 matrix
    matrixB = np.random.random((2, 2))

    # Answer exported to question.
    data["correct_answers"]["matrixB"] = pl.to_json(matrixB)
```

## Customizations

| Attribute        | Type                                  | Default    | Description                                                                                                                                                          |
| ---------------- | ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-complex`  | boolean                               | false      | Whether to allow complex numbers as answers.                                                                                                                         |
| `answers-name`   | string                                | —          | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. |
| `aria-label`     | string                                | —          | An accessible label for the element.                                                                                                                                 |
| `atol`           | number                                | 1e-8       | Absolute tolerance for `comparison="relabs"`.                                                                                                                        |
| `comparison`     | `"relabs"`, `"sigfig"`, or `"decdig"` | `"relabs"` | How to grade. `"relabs"` uses relative (`rtol`) and absolute (`atol`) tolerances. `"sigfig"` and `"decdig"` use `digits` significant or decimal digits.              |
| `digits`         | integer                               | 2          | number of digits that must be correct for `comparison="sigfig"` or `comparison="decdig"`.                                                                            |
| `initial-value`  | string                                | —          | Initial value to prefill the input box the first time it is rendered.                                                                                                |
| `label`          | string                                | —          | A prefix to display before the input box (e.g., `label="$F =$"`).                                                                                                    |
| `rtol`           | number                                | 1e-2       | Relative tolerance for `comparison="relabs"`.                                                                                                                        |
| `show-help-text` | boolean                               | true       | Show the question mark at the end of the input displaying required input parameters.                                                                                 |
| `weight`         | integer                               | 1          | Weight to use when computing a weighted average score over elements.                                                                                                 |

## Details

`pl-matrix-input` parses a matrix entered in `MATLAB` or `Python` format.
The following are valid input format options:

**MATLAB format:**

```m
[1.23; 4.56]
```

**Python format:**

```python
[[1.23], [4.56]]
```

**Note:** A scalar will be accepted either as a matrix of size 1 x 1 (e.g., `[1.23]` or `[[1.23]]`) or just as a single number (e.g., `1.23`).

In the answer panel, a `pl-matrix-input` element displays the correct answer, allowing the user to switch between matlab and python format.

In the submission panel, a `pl-matrix-input` element displays either the submitted answer (in the same format that it was submitted, either MATLAB or Python), or a note that the submitted answer was invalid (with an explanation of why).

## Example implementations

- [demo/matrixComplexAlgebra]

## See also

- [`pl-matrix-component-input` for individual input boxes for each element in the matrix](pl-matrix-component-input.md)
- [`pl-number-input` for a single numeric input](pl-number-input.md)
- [`pl-symbolic-input` for a mathematical expression input](pl-symbolic-input.md)

---

[demo/matrixcomplexalgebra]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/matrixComplexAlgebra

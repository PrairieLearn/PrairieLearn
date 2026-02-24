# `pl-matrix-component-input` element

A `pl-matrix-component-input` element displays a grid of input fields with
the same shape of the variable stored in `answers-name`
(only 2D arrays of real numbers can be stored in `answers-name`).

## Sample element

![Screenshot of the pl-matrix-component-input element](pl-matrix-component-input.png)

```html title="question.html"
<pl-matrix-component-input answers-name="matrixA" label="$A=$"></pl-matrix-component-input>
```

```python title="server.py"
import prairielearn as pl
import numpy as np

def generate(data):

    # Generate a random 3x3 matrix
    mat = np.random.random((3, 3))

    # Answer to each matrix entry converted to JSON
    data["correct_answers"]["matrixA"] = pl.to_json(mat)
```

## Customizations

| Attribute              | Type                                  | Default                  | Description                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `allow-blank`          | boolean                               | false                    | Whether empty input boxes are allowed. By default, matrices with at least one empty input box will not be graded (invalid format).                                                                                             |
| `allow-feedback`       | boolean                               | `"allow-partial-credit"` | Whether to allow feedback indicating which matrix components are incorrect. The default value of `allow-feedback` is the value of `"allow-partial-credit"`.                                                                    |
| `allow-fractions`      | boolean                               | true                     | Whether to allow answers expressed as a rational number of the format `a/b`.                                                                                                                                                   |
| `allow-partial-credit` | boolean                               | false                    | Whether to allow credit for each correct matrix component. By default, the variable is graded as correct only when all matrix components are correct.                                                                          |
| `answers-name`         | string                                | —                        | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                                                           |
| `aria-label`           | string                                | —                        | An accessible label for the element.                                                                                                                                                                                           |
| `atol`                 | number                                | 1e-8                     | Absolute tolerance for `comparison="relabs"`.                                                                                                                                                                                  |
| `blank-value`          | string                                | 0 (zero)                 | Value to be used as an answer for each individual component if the component is left blank. Only applied if `allow-blank` is `true`. Must follow the same format as an expected user input (e.g., fractions if allowed, etc.). |
| `comparison`           | `"relabs"`, `"sigfig"`, or `"decdig"` | `"relabs"`               | How to grade. `"relabs"` uses relative (`rtol`) and absolute (`atol`) tolerances. `"sigfig"` and `"decdig"` use `digits` significant or decimal digits.                                                                        |
| `digits`               | integer                               | 2                        | number of digits that must be correct for `comparison="sigfig"` or `comparison="decdig"`.                                                                                                                                      |
| `label`                | string                                | —                        | A prefix to display before the input box (e.g., `label="$F =$"`).                                                                                                                                                              |
| `rtol`                 | number                                | 1e-2                     | Relative tolerance for `comparison="relabs"`.                                                                                                                                                                                  |
| `weight`               | integer                               | 1                        | Weight to use when computing a weighted average score over elements.                                                                                                                                                           |

## Details

The question will only be graded when all matrix components are entered, unless the `allow-blank` attribute is enabled.

## Example implementations

- [element/matrixComponentInput]

## See also

- [`pl-matrix-input` for a matrix formatted in an implemented programming language](pl-matrix-input.md)
- [`pl-number-input` for a single numeric input](pl-number-input.md)
- [`pl-symbolic-input` for a mathematical expression input](pl-symbolic-input.md)

---

[element/matrixcomponentinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/matrixComponentInput

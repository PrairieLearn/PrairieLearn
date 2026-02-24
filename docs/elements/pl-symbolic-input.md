# `pl-symbolic-input` element

Fill in the blank field that allows for mathematical symbol input.

## Sample element

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

## Customizations

| Attribute                       | Type                    | Default                 | Description                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `additional-simplifications`    | string                  | -                       | Simplifications that should be applied during grading before using SymPy's built-in equality checker. Using this attribute can prevent rare cases of non-convergence during grading. See [the non-convergence section](#non-convergence-in-grading) for more details before using this attribute.                                               |
| `allow-blank`                   | boolean                 | false                   | Whether an empty input box is allowed. By default, an empty input box will not be graded (invalid format).                                                                                                                                                                                                                                      |
| `allow-complex`                 | boolean                 | false                   | Whether complex numbers (expressions with `i` or `j` as the imaginary unit) are allowed.                                                                                                                                                                                                                                                        |
| `allow-trig-functions`          | boolean                 | true                    | Whether trigonometric functions (`cos`, `atanh`, ...) are allowed.                                                                                                                                                                                                                                                                              |
| `answers-name`                  | string                  | —                       | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. If the correct answer is set in `server.py` as a complex object, you should use `import prairielearn as pl` and `data["correct_answers"][answers-name] = pl.to_json(ans)`. |
| `aria-label`                    | string                  | —                       | An accessible label for the element.                                                                                                                                                                                                                                                                                                            |
| `blank-value`                   | string                  | 0 (zero)                | Expression to be used as an answer if the answer is left blank. Only applied if `allow-blank` is `true`. Must be `""` (empty string) or follow the same format as an expected user input (e.g., same variables, etc.).                                                                                                                          |
| `correct-answer`                | string                  | See description         | Correct answer for grading. Defaults to `data["correct_answers"][answers-name]`.                                                                                                                                                                                                                                                                |
| `custom-functions`              | string                  | —                       | A comma-delimited list of custom functions that can be used in the symbolic expression.                                                                                                                                                                                                                                                         |
| `display`                       | `"block"` or `"inline"` | `"inline"`              | How to display the input field.                                                                                                                                                                                                                                                                                                                 |
| `display-log-as-ln`             | boolean                 | `false`                 | Whether `ln` rather than `log` should be used when displaying submissions and correct answers. Both are considered equivalent and can be used by the student in their submitted answer.                                                                                                                                                         |
| `display-simplified-expression` | boolean                 | `true`                  | Whether expressions submitted by students should be displayed in their simplified form. Setting `display-simplified-expression="false"` can prevent unintended simplifications that might confuse students. Note that, regardless of this setting, answers are always simplified for grading purposes.                                          |
| `formula-editor`                | boolean                 | false                   | Whether the element should provide a visual formula editor for students (recommended when answers are long or contain nested mathematical expressions).                                                                                                                                                                                         |
| `imaginary-unit-for-display`    | string                  | `"i"`                   | The imaginary unit that is used for display. It must be either `"i"` or `"j"`. Again, this is _only_ for display. Both `i` and `j` can be used by the student in their submitted answer, when `allow-complex="true"`.                                                                                                                           |
| `initial-value`                 | string                  | —                       | Initial value to prefill the input box the first time it is rendered.                                                                                                                                                                                                                                                                           |
| `label`                         | string                  | —                       | A prefix to display before the input box (e.g., `label="$F =$"`).                                                                                                                                                                                                                                                                               |
| `placeholder`                   | string                  | `"symbolic expression"` | Hint displayed inside the input box describing the expected type of input.                                                                                                                                                                                                                                                                      |
| `show-help-text`                | boolean                 | true                    | Show the question mark at the end of the input displaying required input parameters.                                                                                                                                                                                                                                                            |
| `show-score`                    | boolean                 | true                    | Whether to show the score badge next to this element.                                                                                                                                                                                                                                                                                           |
| `size`                          | integer                 | 35                      | Size of the input box.                                                                                                                                                                                                                                                                                                                          |
| `suffix`                        | string                  | —                       | A suffix to display after the input box (e.g., `suffix="$\rm m/s^2$"`).                                                                                                                                                                                                                                                                         |
| `variables`                     | string                  | —                       | A comma-delimited list of symbols that can be used in the symbolic expression.                                                                                                                                                                                                                                                                  |
| `weight`                        | integer                 | 1                       | Weight to use when computing a weighted average score over elements.                                                                                                                                                                                                                                                                            |

## Details

Correct answers are best created as `sympy` expressions and converted to json using `pl.to_json`. It is also possible to specify the correct answer simply as a string, e.g., `x + y + 1`.

Variables with the same name as greek letters (e.g., `alpha`, `beta`, etc.) will be automatically converted to their LaTeX equivalents for display on the correct answer and submission panels.

Do not include `i` or `j` in the list of `variables` if `allow-complex="true"`, and do not include any other reserved name in your list of `variables` (`e`, `pi`, `cos`, `sin`, etc.). The element code will check for (and disallow) conflicts between your list of `variables`, `custom-functions`, and reserved names.

Note that variables created with additional assumptions in a correct answer will have those assumptions respected when evaluating student answers.
See example question for details.

## Example implementations

- [element/symbolicInput]

## See also

- [`pl-number-input` for numeric input](pl-number-input.md)
- [`pl-integer-input` for integer input](pl-integer-input.md)
- [`pl-string-input` for string input](pl-string-input.md)

### Non-convergence in grading

In rare cases, the `pl-symbolic-input` question element can produce grading results that mark a student answer as "non-converging" during grading. In these cases, answers are marked as invalid, since it could not be determined if they are correct or incorrect.

#### Why grading might not converge

The `pl-symbolic-input` question element uses the Python library [SymPy](https://www.sympy.org) to represent and grade expressions. During grading, the correct answer and the student submission are parsed into SymPy expressions and then compared using the library's built-in equality checker.

Checking for equality is non-trivial as it accounts for a wide range of mathematical equivalences (e.g., `log(10*x)` is considered equal to `log(10)+log(x)`, or `(x+1)**2` is equal to `x**2+2*x+1`). To account for all possible combinations of equivalence rules, [SymPy applies simplifications heuristically](https://docs.sympy.org/latest/tutorials/intro-tutorial/simplification.html) and potentially repeatedly. Unfortunately this means that there is no bound on how long the equality checker might take to finish, and in rare cases it might even get stuck in a non-terminating simplification cycle.

PrairieLearn automatically terminates SymPy's equality check after a few seconds have passed. This check is applied in two cases. The element then marks student submission as invalid during grading if their submission caused a timeout. Note that both correct and incorrect answers can potentially trigger timeouts. Students are presented with an error message that tells them `Your answer did not converge, try a simpler expression.`. If desired, this behavior can be replaced with custom grading code in the [`server.py` file](../question/server.md#step-5-grade) of the question.

#### Preventing non-convergence by adding `additional-simplifications`

Terminating SymPy's equality check is a last resort to ensure that the normal grading process (including custom question grading defined in `server.py`) can complete. When presented with a non-convergence error, students might misinterpret it as a sign that the question is faulty, although even small changes to their answer (e.g., manually expanding a term) might resolve the issue and it is very rare that correct answers trigger non-convergence errors.

SymPy is less likely to experience issues if both the correct and submitted answer share the same structure. As an instructor, it therefore _might_ be possible to prevent timeouts by "guiding" SymPy's equality checking process. This can be achieved by providing SymPy with a list of simplification steps that it should execute before relying on its built-in heuristics. For example, the `trigsimp` simplification step can convert `sin(x)/cos(x)` into `tan(x)`, and `expand` can convert expressions like `(x+1)**2` into `x**2+2*x+1`.

!!! warning

    Applying `additional-simplifications` is not guaranteed to work around all timeout issues. The optimal simplification order for a specific question depends on the complexity and domain of the question (e.g., whether it uses trigonometric functions). If a question experiences non-convergence issues, it might be easier to change the expected answer rather than experimenting with this parameter.

The table below lists the possible simplifications that can be provided to the attribute `additional-simplifications`, and are applied in the order they are listed:

| Simplification | Description                   | Example                          |
| -------------- | ----------------------------- | -------------------------------- |
| `expand`       | Expanding polynomials         | `(x + 1)**2` => `x**2 + 2*x + 1` |
| `powsimp`      | Power simplifications         | `x**a*x**b` => `x**(a + b)`      |
| `trigsimp`     | Trigonometric simplifications | `sin(x)/cos(x)` => `tan(x)`      |
| `expand_log`   | Logarithmic simplifications   | `log(x*y)` => `log(x) + log(y)`  |

Some specific examples of successful uses of `additional-simplifications` are:

- `(-8*x*sin(8*x)/cos(8*x) + log(cos(8*x)))*cos(8*x)**x` benefitted from `additional-simplifications="trigsimp"`.
- `7**(x + 8)*log(7)` benefitted from `additional-simplifications="expand"`

!!! note

    All of the simplifications above are already considered in SymPy's built-in heuristics, so listing them in `additional-simplifications` does not affect the display of expressions or the grading results _except_ in cases where a timeout occurs. Also note that simplifications are always applied to both the correct and the submitted answer, because the goal is to increase their similarity (e.g., both are fully expanded) rather than aiming for a specific form (e.g., expanding vs. factoring).

---

[element/symbolicinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/symbolicInput

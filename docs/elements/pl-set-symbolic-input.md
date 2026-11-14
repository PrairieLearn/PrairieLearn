# `pl-set-symbolic-input` element

Fill in a symbolic set using a parser dedicated to set notation. Use this element for new set-valued answers instead of `pl-symbolic-input allow-sets="true"`.

## Sample element

```html title="question.html"
<pl-set-symbolic-input answers-name="points" variables="a" label="$P =$"></pl-set-symbolic-input>
```

```python title="server.py"
import prairielearn as pl
import sympy


def generate(data):
    a = sympy.Symbol("a")
    answer = sympy.FiniteSet(sympy.Tuple(1, a), sympy.Tuple(a + 1, 2))
    data["correct_answers"]["points"] = pl.to_json(answer)
```

Correct answers may also be written with the element syntax, for example `correct-answer="R - {0}"`.

## Syntax

The whole answer must be a set. Supported forms are:

- finite sets, such as `{1, 2, x + 1}` and nested finite sets such as `{{1}, {2}}`;
- in the default `syntax="tuple"` mode, tuples of two or more scalar coordinates as set members, such as `{(1, 2), (x, y + 1)}`;
- in `syntax="interval"` mode, intervals with any open or closed endpoints, such as `(-infty, 0]` and `[a, b)`;
- the named sets `R`, `Q`, `Z`, `N`, and `C`, representing the real, rational, integer, natural, and complex numbers;
- union using `U`, `cup`, `∪`, `|`, or `+`;
- intersection using `cap`, `∩`, or `&`;
- set difference using `-`.

Tuple and interval syntax are mutually exclusive. Tuple mode rejects interval notation, while interval mode interprets two comma-separated endpoints in parentheses as an open interval rather than a tuple.

Scalar members, tuple coordinates, and interval endpoints use the usual `pl-symbolic-input` expression syntax. Function-style constructors such as `Tuple(1, 2)` and `Interval(0, 1)`, qualified names, and long named-set forms such as `Reals` are not accepted student syntax.

The names `R`, `Q`, `Z`, `N`, and `C` are reserved and cannot appear in `variables` or `custom-functions`.

## Customizations

| Attribute                       | Type                      | Default    | Description                                                                                                              |
| ------------------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `allow-blank`                   | boolean                   | false      | Whether an empty input is allowed.                                                                                       |
| `allow-complex`                 | boolean                   | false      | Whether scalar members, tuple coordinates, and interval endpoints may contain complex values.                            |
| `allow-trig-functions`          | boolean                   | true       | Whether trigonometric functions are allowed in scalar expressions.                                                       |
| `answers-name`                  | string                    | —          | Unique key used to store the answer.                                                                                     |
| `aria-label`                    | string                    | —          | Accessible label for the input.                                                                                          |
| `blank-value`                   | string                    | `{}`       | Set used when the input is blank and `allow-blank` is true. May also be the empty string.                                |
| `correct-answer`                | string                    | —          | Correct answer in the supported set syntax. Defaults to `data["correct_answers"][answers-name]`.                         |
| `custom-functions`              | string                    | —          | Comma-delimited custom functions allowed in scalar expressions.                                                          |
| `display`                       | `"block"` or `"inline"`   | `"inline"` | Display mode.                                                                                                            |
| `display-log-as-ln`             | boolean                   | false      | Display `ln` instead of `log`.                                                                                           |
| `display-simplified-expression` | boolean                   | true       | Whether scalar expressions and stored sets are displayed in simplified form. Set operations are retained during parsing. |
| `formula-editor`                | boolean                   | false      | Use the visual formula editor, including keys for the selected set syntax and the five named sets.                       |
| `imaginary-unit-for-display`    | `"i"` or `"j"`            | `"i"`      | Imaginary unit used for display.                                                                                         |
| `initial-value`                 | string                    | —          | Initial value shown the first time the input renders.                                                                    |
| `label`                         | string                    | —          | Prefix displayed before the input.                                                                                       |
| `placeholder`                   | string                    | `"set"`    | Input placeholder.                                                                                                       |
| `show-help-text`                | boolean                   | true       | Show the set syntax help popover.                                                                                        |
| `show-score`                    | boolean                   | true       | Show the score badge.                                                                                                    |
| `size`                          | integer                   | 35         | Plain-text input size.                                                                                                   |
| `suffix`                        | string                    | —          | Suffix displayed after the input.                                                                                        |
| `syntax`                        | `"tuple"` or `"interval"` | `"tuple"`  | Enable tuple or interval notation. The two forms cannot be enabled together.                                             |
| `variables`                     | string                    | —          | Comma-delimited scalar variable names.                                                                                   |
| `weight`                        | integer                   | 1          | Weight used when computing the question score.                                                                           |

Correct answers supplied through `server.py` must use only the set classes representable in the selected syntax. In tuple mode, use `sympy.FiniteSet` containing `sympy.Tuple` values; in interval mode, use `sympy.Interval`. `Range`, `ConditionSet`, `ImageSet`, `ProductSet`, `UniversalSet`, and other SymPy set classes are rejected during element preparation.

## Example implementations

- [element/setSymbolicInput]

## See also

- [`pl-symbolic-input` for general symbolic expressions](pl-symbolic-input.md)

[element/setsymbolicinput]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/setSymbolicInput

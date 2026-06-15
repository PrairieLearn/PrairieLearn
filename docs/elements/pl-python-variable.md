# `pl-python-variable` element

Displays the value of a Python variable. It uses options similar to the [pprint](https://docs.python.org/3/library/pprint.html) module to format output data, and can recursively print nested data structures. As such, some descriptions below are taken directly from this documentation.

## Sample elements

![Screenshot of the pl-python-variable element](pl-python-variable.png)

```html title="question.html"
<pl-python-variable params-name="variable"></pl-python-variable>
```

```python title="server.py"
import prairielearn as pl

def generate(data):
    data_dictionary = { "a": 1, "b": 2, "c": 3 }
    data["params"]["variable"] = pl.to_json(data_dictionary)
```

## Customizations

| Attribute           | Type    | Default | Description                                                                                                                                                                                                                                                                                      |
| ------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compact-sequences` | boolean | false   | Impacts the way that long sequences (lists, tuples, sets, etc.) are formatted. If `compact-sequences` is false (the default) then each item of a sequence will be formatted on a separate line. If it is true, as many items as will fit within the width will be formatted on each output line. |
| `copy-code-button`  | boolean | false   | Whether to include a button to copy the code displayed by this element.                                                                                                                                                                                                                          |
| `depth`             | integer | —       | The number of nesting levels which may be printed; if the data structure being printed is too deep, the next contained level is replaced by ... By default, there is no constraint on the depth of the objects being formatted.                                                                  |
| `indent`            | integer | 1       | Specifies the amount of indentation added for each nesting level when printing nested objects.                                                                                                                                                                                                   |
| `no-highlight`      | boolean | false   | Disable syntax highlighting.                                                                                                                                                                                                                                                                     |
| `params-name`       | string  | —       | The name of the key in `data["params"]` to get a value from.                                                                                                                                                                                                                                     |
| `prefix`            | string  | (empty) | Any prefix to append to the output in `text` mode.                                                                                                                                                                                                                                               |
| `prefix-newline`    | boolean | false   | Add newline to the end of `prefix`.                                                                                                                                                                                                                                                              |
| `show-line-numbers` | boolean | false   | Whether to show line numbers in code displayed by this element.                                                                                                                                                                                                                                  |
| `sort-dicts`        | boolean | true    | If true, dictionaries will be formatted with their keys sorted, otherwise they will display in insertion order.                                                                                                                                                                                  |
| `suffix`            | string  | (empty) | Any suffix to append to the output in `text` mode.                                                                                                                                                                                                                                               |
| `suffix-newline`    | boolean | false   | Add newline before the start of `suffix`.                                                                                                                                                                                                                                                        |
| `width`             | integer | 80      | Specifies the desired maximum number of characters per line in the output. If a structure cannot be formatted within the width constraint, a best effort will be made.                                                                                                                           |

## Details

The element supports displaying Python objects via `repr()`, with support for more complex display options similar to the built-in `pprint` library. **Objects to be displayed must be serializable to JSON.** For details about what objects can be serialized and how to do this with the provided `to_json` and `from_json` functions, see the [Question Writing documentation](../question/server.md#question-data-storage). To display objects that cannot be easily JSON serialized, please refer to the `pl-code` example question [element/code].

Printing Pandas DataFrames with this element is deprecated. Please use the new [`pl-dataframe`](pl-dataframe.md) element for this purpose.

## Example implementations

- [element/pythonVariable]

## See also

- [`pl-code` to display blocks of code with syntax highlighting](pl-code.md)
- [`pl-variable-output` for displaying a matrix or element in code form.](pl-variable-output.md)
- [`pl-dataframe` for displaying dataframes.](pl-dataframe.md)

[element/code]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/code
[element/pythonvariable]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/pythonVariable

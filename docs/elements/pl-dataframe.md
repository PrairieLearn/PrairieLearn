# `pl-dataframe` element

Displays a formatted display of Pandas DataFrames, with various options for displaying types of columns and code for reproducing the DataFrame.

## Sample elements

```html title="question.html"
<pl-dataframe params-name="df" show-index="false" show-dimensions="false" digits="4"></pl-dataframe>
```

```python title="server.py"
import prairielearn as pl
import pandas as pd

def generate(data):
    df = pd.read_csv("breast-cancer-train.dat", header=None)
    data["params"]["df"] = pl.to_json(df.head(15))
```

## Customizations

| Attribute               | Type                 | Default    | Description                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `digits`                | integer              | —          | Number of digits to display for floating-point entries.                                                                                                                                                                                                                                                                                                            |
| `display-language`      | `"python"`, or `"r"` | `"python"` | Language to use for displaying data types and indices.                                                                                                                                                                                                                                                                                                             |
| `display-variable-name` | string               | `"df"`     | Variable name to display in code to recreate DataFrame.                                                                                                                                                                                                                                                                                                            |
| `params-name`           | string               | —          | The name of the key in `data["params"]` to get a value from.                                                                                                                                                                                                                                                                                                       |
| `presentation-type`     | string               | `"g"`      | Floating-point number display format. If `digits` is specified, formatted using `'{:.{digits}{presentation-type}}'`, otherwise `'{:{presentation-type}}'`. See [the Python documentation](https://docs.python.org/3/library/string.html#format-specification-mini-language) for more information on allowable presentation types for `float` and `Decimal` values. |
| `show-dimensions`       | boolean              | true       | Show a footer with the dimensions of a DataFrame.                                                                                                                                                                                                                                                                                                                  |
| `show-dtype`            | boolean              | false      | Show the data types contained in each column of the DataFrame at the bottom of each column. Types used correspond to the `display-language` parameter.                                                                                                                                                                                                             |
| `show-header`           | boolean              | true       | Show the header row of a DataFrame.                                                                                                                                                                                                                                                                                                                                |
| `show-index`            | boolean              | true       | Show the index column of a DataFrame. Will switch to 1-indexing if using the default index and `display-language` is "r".                                                                                                                                                                                                                                          |
| `show-python`           | boolean              | true       | Show code that can be used to recreate the DataFrame in Python in a separate tab.                                                                                                                                                                                                                                                                                  |
| `width`                 | integer              | 500        | Max characters per line for displaying Python code.                                                                                                                                                                                                                                                                                                                |

## Details

When setting a parameter, use PrairieLearn's built in `pl.to_json()` on the DataFrame to display. Note that there are multiple serialization options for Pandas DataFrames. Encoding a DataFrame `df` by setting `pl.to_json(df, df_encoding_version=2)` allows for missing and date time values whereas `pl.to_json(df, df_encoding_version=1)` (default) does not. However, `df_encoding_version=1` has support for complex numbers, while `df_encoding_version=2` does not.

Note that some Python types may not be serialized correctly in the code provided to reconstruct the DataFrame.

## Example implementations

- [element/dataframe]
- [demo/randomDataFrame]

## See also

- [`pl-code` to display blocks of code with syntax highlighting](pl-code.md)
- [`pl-variable-output` for displaying a matrix or element in code form.](pl-variable-output.md)
- [`pl-python-variable` for displaying a formatted output of Python variables.](pl-python-variable.md)

[demo/randomdataframe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/randomDataFrame
[element/dataframe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/dataframe

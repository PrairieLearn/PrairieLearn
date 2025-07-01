import pprint
from enum import Enum

import chevron
import lxml.html
import pandas as pd
import prairielearn as pl
from typing_extensions import assert_never


class DisplayLanguage(Enum):
    PYTHON = 1
    R = 2


# Taken from: https://docs.python.org/3/library/string.html#format-specification-mini-language
VALID_PRESENTATION_TYPES = {"e", "E", "f", "F", "g", "G", "n", "%"}

SHOW_HEADER_DEFAULT = True
SHOW_INDEX_DEFAULT = True
SHOW_DIMENSIONS_DEFAULT = True
DISPLAY_LANGUAGE_DEFAULT = DisplayLanguage.PYTHON
DISPLAY_VARIABLE_NAME_DEFAULT = "df"
SHOW_DTYPE_DEFAULT = False
NUM_DIGITS_DEFAULT = None
SHOW_PYTHON_DEFAULT = True
WIDTH_DEFAULT = 500
PRESENTATION_TYPE_DEFAULT = "g"


def convert_pandas_dtype_to_r(s: pd.Series) -> str:
    # Force series to avoid odd element-wise output
    _ = s.dtype

    if pd.api.types.is_float_dtype(s):
        return "numeric"
    elif pd.api.types.is_integer_dtype(s):
        return "integer"
    elif pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s):
        return "character"
    elif isinstance(s, pd.CategoricalDtype):
        # Check if ordered
        if s.cat.ordered:
            return "ordered factor"
        return "factor"
    elif pd.api.types.is_bool_dtype(s):
        return "logical"
    elif pd.api.types.is_complex_dtype(s):
        return "complex"
    elif pd.api.types.is_datetime64_any_dtype(s):
        return "POSIXct"
    elif pd.api.types.is_timedelta64_dtype(s) or isinstance(s, pd.PeriodDtype):
        return "Not supported"

    return "Unknown"


def get_pandas_dtype(s: pd.Series) -> str:
    return str(s.dtype)


def using_default_index(df: pd.DataFrame) -> bool:
    return pd.api.types.is_integer_dtype(df.index) and pd.Index(range(len(df))).equals(
        df.index
    )


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["params-name"],
        optional_attribs=[
            "show-index",
            "show-header",
            "show-dimensions",
            "show-dtype",
            "show-python",
            "display-language",
            "display-variable-name",
            "digits",
            "width",
            "presentation-type",
        ],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    varname = pl.get_string_attrib(element, "params-name")
    show_index = pl.get_boolean_attrib(element, "show-index", SHOW_INDEX_DEFAULT)
    show_header = pl.get_boolean_attrib(element, "show-header", SHOW_HEADER_DEFAULT)
    show_python = pl.get_boolean_attrib(element, "show-python", SHOW_PYTHON_DEFAULT)
    show_dimensions = pl.get_boolean_attrib(
        element, "show-dimensions", SHOW_DIMENSIONS_DEFAULT
    )
    show_dtype = pl.get_boolean_attrib(element, "show-dtype", SHOW_DTYPE_DEFAULT)

    display_language = pl.get_enum_attrib(
        element, "display-language", DisplayLanguage, DISPLAY_LANGUAGE_DEFAULT
    )
    display_variable_name = pl.get_string_attrib(
        element, "display-variable-name", DISPLAY_VARIABLE_NAME_DEFAULT
    )

    num_digits = pl.get_integer_attrib(element, "digits", NUM_DIGITS_DEFAULT)
    presentation_type = pl.get_string_attrib(
        element, "presentation-type", PRESENTATION_TYPE_DEFAULT
    )

    width = pl.get_integer_attrib(element, "width", WIDTH_DEFAULT)

    if varname not in data["params"]:
        raise KeyError(
            f'Could not find "{varname}" in params. Please double check the parameter name is spelled correctly.'
        )

    if presentation_type not in VALID_PRESENTATION_TYPES:
        raise ValueError(
            f'Invalid presentation type "{presentation_type}", must be one of {VALID_PRESENTATION_TYPES}.'
        )

    # Always assume that entry in params dict is serialized dataframe
    frame = pl.from_json(data["params"][varname])

    if not isinstance(frame, pd.DataFrame):
        raise TypeError(f'Parameter name "{varname}" does not encode a dataframe.')

    frame_style = frame.style

    # Format integers using commas every 3 digits
    integer_column_names = frame.select_dtypes(include="int").columns
    frame_style.format(subset=integer_column_names, thousands=",")

    # Generate format string
    if num_digits is None:
        format_str = f"{{:{presentation_type}}}"
    else:
        # This format string displays the specified number of digits
        format_str = f"{{:.{num_digits}{presentation_type}}}"

    # Get headers for all floating point columns and style them to use the desired number of digits.
    float_column_names = frame.select_dtypes(include="float").columns
    frame_style.format(subset=float_column_names, formatter=format_str)

    if show_dtype:
        if display_language is DisplayLanguage.PYTHON:
            get_dtype_function = get_pandas_dtype
        elif display_language is DisplayLanguage.R:
            get_dtype_function = convert_pandas_dtype_to_r
        else:
            assert_never(display_language)

        descriptors = frame.agg([get_dtype_function]).set_axis(
            ["dtype"], axis="index", copy=False
        )
        other = descriptors.style.map(lambda v: "font-weight: bold;")
        frame_style.set_table_styles([
            {"selector": ".foot_row0", "props": "border-top: 1px solid black;"}
        ])
        frame_style.concat(other)

    if not show_header:
        frame_style.hide(axis="columns")

    if show_index:
        # Switch row indices to being 1-based if index is default. Ignore otherwise.
        if display_language is DisplayLanguage.R and using_default_index(frame):
            frame_style.format_index(lambda x: x + 1)  # type: ignore
    else:
        frame_style.hide()

    # Might be worth moving everything out of the CSS file and handle it all with the builtin styler.
    frame_style.set_table_attributes("class=pl-dataframe-table")

    html_params: dict[str, str | bool | int] = {
        "uuid": pl.get_uuid(),
        "frame_html": frame_style.to_html(),
        "code_string": pprint.pformat(
            frame.to_dict(), width=width, indent=4, sort_dicts=False
        ),
        "varname": display_variable_name,
        "show_python": show_python,
    }

    if show_dimensions:
        html_params["num_rows"], html_params["num_cols"] = frame.shape

    with open("pl-dataframe.mustache", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()

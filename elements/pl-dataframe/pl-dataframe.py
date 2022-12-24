from typing import Any, List, cast

import chevron
import lxml.html
import pandas
import prairielearn as pl

NO_HIGHLIGHT_DEFAULT = False
PREFIX_DEFAULT = ""
SUFFIX_DEFAULT = ""
TEXT_DEFAULT = False
SHOW_HEADER_DEFAULT = True
SHOW_INDEX_DEFAULT = True
SHOW_DIMENSIONS_DEFAULT = True
SHOW_DATATYPE_DEFAULT = False
ADD_LINE_BREAKS_DEFAULT = False
INTERACTIVE_DEFAULT = True
NUM_DIGITS_DEFAULT = None


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["params-name"],
        optional_attribs=[
            "show-header",
            "show-index",
            "show-dimensions",
            "show-dtype",
            "interactive",
            "digits",
        ],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    varname = pl.get_string_attrib(element, "params-name")
    show_header = pl.get_boolean_attrib(element, "show-header", SHOW_HEADER_DEFAULT)
    show_index = pl.get_boolean_attrib(element, "show-index", SHOW_INDEX_DEFAULT)
    interactive = pl.get_boolean_attrib(element, "interactive", INTERACTIVE_DEFAULT)
    show_dimensions = pl.get_boolean_attrib(
        element, "show-dimensions", SHOW_DIMENSIONS_DEFAULT
    )
    show_dtype = pl.get_boolean_attrib(element, "show-dtype", SHOW_DATATYPE_DEFAULT)

    num_digits = pl.get_integer_attrib(element, "digits", NUM_DIGITS_DEFAULT)

    if varname not in data["params"]:
        raise KeyError(
            f'Could not find {varname} in params. Please make sure to set params-name="{varname}" in the element.'
        )

    # Always assume that entry in params dict is serialized dataframe
    frame = pl.from_json(data["params"][varname])

    if not isinstance(frame, pandas.DataFrame):
        raise ValueError(f"Parameter name '{varname}' does not encode a dataframe.")

    frame = cast(pandas.DataFrame, frame)

    frame_style = frame.style
    dtype_row = None

    # Format integers using commas every 3 digits
    integer_column_names = frame.select_dtypes(include="int").columns
    frame_style.format(subset=integer_column_names, thousands=",")

    if num_digits is not None:
        # Get headers for all floating point columns and style them to use the desired number of sig figs.
        float_column_names = frame.select_dtypes(include="float").columns

        # This format string displays the desired number of digits, as given by the instructor
        # Switches between exponential and decimal notation as needed
        frame_style.format(subset=float_column_names, formatter=f"{{:.{num_digits}g}}")

    if show_dtype:
        descriptors = frame.agg([lambda s: s.dtype])
        descriptors.index = pandas.Index(["dtype"])
        other = descriptors.style.applymap(lambda v: "font-weight: bold;")
        #dtype_row = other.to_html()
        frame_style.set_table_styles(
            [{"selector": ".foot_row0", "props": "border-top: 1px solid black;"}]
        )
        #print(frame_style.to_html())
        #dtype_row = "<tfoot><tr>" + "<th>dtype</th>" + " ".join([f"<th>{i}</th>\n" for i in descriptors])+"</tr>\n  </tfoot>"

        frame_style.concat(other)

    if not show_header:
        frame_style.hide(axis="columns")

    if not show_index:
        frame_style.hide()

    # Might be worth moving everything out of the CSS file and handle it all with the builtin styler.
    # TODO switch interactivity to use UUID as id
    if interactive:
        frame_style.set_table_attributes(
            'class="pl-dataframe-table interactive-dataframe"'
        )
    else:
        frame_style.set_table_attributes('class="pl-dataframe-table"')

    print(frame_style.to_string(delimiter='*'))
    info_params = {
        "frame_html": frame_style.to_html(),
        "varname": varname,
        "code_string": frame.to_dict("split"),
    }

    if show_dimensions:
        info_params["num_rows"] = frame.shape[0]
        info_params["num_cols"] = frame.shape[1]

    with open("pl-dataframe.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, info_params).strip()

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
            "show-index",
            "show-dimensions",
            "show-dtype",
            "digits",
        ],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    varname = pl.get_string_attrib(element, "params-name")
    show_index = pl.get_boolean_attrib(element, "show-index", SHOW_INDEX_DEFAULT)
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

    frame_footer_dict = {}

    if show_dtype:
        descriptors = frame.agg([lambda s: s.dtype])
        #descriptors.index = pandas.Index(["dtype"])
        frame_footer_dict["data_types"] = list(map(str, descriptors.values.tolist()[0]))

    # Format integers using commas every 3 digits
    integer_column_names = frame.select_dtypes(include="int").columns
    frame[integer_column_names] = frame[integer_column_names].applymap(lambda n: "{:,}".format(n))
    #frame_style.format(subset=integer_column_names, thousands=",")

    if num_digits is not None:
        # Get headers for all floating point columns and style them to use the desired number of sig figs.
        float_column_names = frame.select_dtypes(include="float").columns

        frame[float_column_names] = frame[float_column_names].applymap(lambda n: f"{{:.{num_digits}g}}".format(n))


    frame_header = {
        "index_name": " " if frame.index.name is None else frame.index.name,
        "header_data": list(map(str, frame.columns))
    }

    frame_data = [
        {
            "index": str(index),
            "row": list(map(str, row)),
        }
        for index, row in frame.iterrows()
    ]


    #print(frame_style.to_string(delimiter='*'))
    info_params = {
        "show_index": show_index,
        "frame_header": frame_header,
        "frame_data": frame_data,
        "frame_footer": frame_footer_dict,
        "varname": varname,
        "code_string": frame.to_dict("split"),
    }

    if show_dimensions:
        info_params["num_rows"] = frame.shape[0]
        info_params["num_cols"] = frame.shape[1]

    with open("pl-dataframe.mustache", "r", encoding="utf-8") as f:
        html = chevron.render(f, info_params).strip()
        #print(html)
        return html

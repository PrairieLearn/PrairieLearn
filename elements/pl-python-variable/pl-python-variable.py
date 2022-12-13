from typing import Any, List, cast

import lxml.html
import numpy as np
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
NUM_SIG_FIGS_DEFAULT = None


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["params-name"],
        optional_attribs=[
            "text",
            "no-highlight",
            "prefix",
            "suffix",
            "show-header",
            "show-index",
            "show-dimensions",
            "add-line-breaks",
            "show-dtype",
            "num-sig-figs",
        ],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    force_text = pl.get_boolean_attrib(element, "text", TEXT_DEFAULT)
    varname = pl.get_string_attrib(element, "params-name")
    show_header = pl.get_boolean_attrib(element, "show-header", SHOW_HEADER_DEFAULT)
    show_index = pl.get_boolean_attrib(element, "show-index", SHOW_INDEX_DEFAULT)
    show_dimensions = pl.get_boolean_attrib(
        element, "show-dimensions", SHOW_DIMENSIONS_DEFAULT
    )
    show_dtype = pl.get_boolean_attrib(element, "show-dtype", SHOW_DATATYPE_DEFAULT)
    add_line_breaks = pl.get_boolean_attrib(
        element, "add-line-breaks", ADD_LINE_BREAKS_DEFAULT
    )
    num_sig_figs = pl.get_integer_attrib(element, "num-sig-figs", NUM_SIG_FIGS_DEFAULT)

    if varname not in data["params"]:
        raise KeyError(
            f'Could not find {varname} in params. Please make sure to set params-name="{varname}" in the element.'
        )

    var_out = data["params"][varname]

    # determine the type of variable to render
    if isinstance(var_out, dict) and "_type" in var_out:
        var_out = pl.from_json(var_out)

    html_list: List[str] = []

    # render the output variable
    if isinstance(var_out, pandas.DataFrame) and not force_text:
        frame = cast(pandas.DataFrame, var_out)
        frame_style = frame.style

        # Format integers using commas every 3 digits
        integer_column_names = frame.select_dtypes(include=[np.integer]).columns
        formatting_dict = dict.fromkeys(integer_column_names, "{:,d}")

        if num_sig_figs is not None:
            # Get headers for all floating point columns and style them to use the desired number of sig figs.
            float_column_names = frame.select_dtypes(include=[np.float]).columns

            # This format string uses the comma to distinguish groups of 3 digits,
            # and displays the desired number of digits, as given by the instructor
            formatting_dict.update(
                dict.fromkeys(float_column_names, f"{{:,.{num_sig_figs}g}}")
            )

        # Set formatting for each data type
        frame_style.format(formatter=formatting_dict)

        if show_dtype:
            descriptors = frame.agg([lambda s: s.dtype])
            descriptors.index = pandas.Index(["dtype"])
            other = descriptors.style.applymap(lambda v: "font-weight: bold;")
            frame_style.set_table_styles(
                [{"selector": ".foot_row0", "props": "border-top: 1px solid black;"}]
            )
            frame_style.concat(other)

        if not show_header:
            frame_style.hide(axis="columns")

        if not show_index:
            frame_style.hide()

        # Might be worth moving everything out of the CSS file and handle it all with the builtin styler.
        frame_style.set_table_attributes("class=pl-python-variable-table")

        html_list.append(frame_style.to_html())
        if show_dimensions:
            html_list.append(
                f'<p class="pl-python-variable-table-dimensions">{frame.shape[0]} rows x {frame.shape[1]} columns</p>'
            )
    else:
        no_highlight = pl.get_boolean_attrib(
            element, "no-highlight", NO_HIGHLIGHT_DEFAULT
        )
        prefix = pl.get_string_attrib(element, "prefix", PREFIX_DEFAULT)
        suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)

        var_string = get_var_string(var_out, add_line_breaks)

        html_list.append(
            f'<pl-code language="python" no-highlight="{no_highlight}">{prefix}{var_string}{suffix}</pl-code>'
        )

    return "".join(html_list)


def get_var_string(var: Any, add_line_breaks: bool) -> str:
    if add_line_breaks:
        if isinstance(var, dict):
            inner_string = ",\n".join(
                f"    {repr(key)}: {repr(val)}" for key, val in var.items()
            )
            return f"{{\n{inner_string}\n}}"

        elif isinstance(var, list):
            inner_string = ",\n".join(f"    {repr(elem)}" for elem in var)
            return f"[\n{inner_string}\n]"

        raise ValueError(f"Line breaks not supported for type {type(var).__name__}")

    return repr(var)

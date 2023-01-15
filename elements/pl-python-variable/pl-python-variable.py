import pprint
from typing import List

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
INDENT_DEFAULT = 1
DEPTH_DEFAULT = None
WIDTH_DEFAULT = 80
COMPACT_DEFAULT = False
SORT_DICTS_DEFAULT = False
UNDERSCORE_NUMBERS_DEFAULT = False


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
            # Pretty print parameters
            "indent",
            "depth",
            "width",
            "compact",
            "depth",
            "sort-dicts",
            "underscore-numbers",
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
    indent = pl.get_integer_attrib(element, "indent", INDENT_DEFAULT)
    depth = pl.get_integer_attrib(element, "depth", DEPTH_DEFAULT)
    width = pl.get_integer_attrib(element, "width", WIDTH_DEFAULT)
    compact = pl.get_boolean_attrib(element, "compact", COMPACT_DEFAULT)
    sort_dicts = pl.get_boolean_attrib(element, "sort-dicts", SORT_DICTS_DEFAULT)
    # TODO this is a python 3.10-only addition, maybe hold off on adding this till non-US servers are upgraded.
    underscore_numbers = pl.get_boolean_attrib(
        element, "underscore-numbers", UNDERSCORE_NUMBERS_DEFAULT
    )

    if varname not in data["params"]:
        raise KeyError(
            f'Could not find {varname} in params. Please make sure to set params-name="{varname}" in the element.'
        )

    # Note this will always work, since if from_json can't convert the object, it does nothing.
    var_out = pl.from_json(data["params"][varname])

    # render the output variable
    if isinstance(var_out, pandas.DataFrame) and not force_text:
        # TODO Because of this, we need to wait for pl-dataframe to get merged before this will work.
        return f'<pl-dataframe show-header="{show_header}" show-index="{show_index}" show-dimensions="{show_dimensions}" show-python="False"></pl-dataframe>'

    else:
        no_highlight = pl.get_boolean_attrib(
            element, "no-highlight", NO_HIGHLIGHT_DEFAULT
        )
        prefix = pl.get_string_attrib(element, "prefix", PREFIX_DEFAULT)
        suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)

        if prefix != PREFIX_DEFAULT:
            prefix += "\\\n"
        if suffix != SUFFIX_DEFAULT:
            suffix = "\\\n" + suffix

        var_string = pprint.pformat(
            var_out,
            indent=indent,
            width=width,
            depth=depth,
            compact=compact,
            underscore_numbers=underscore_numbers,
            sort_dicts=sort_dicts,
        )

        return f'<pl-code language="python" no-highlight="{no_highlight}">{prefix}{var_string}{suffix}</pl-code>'

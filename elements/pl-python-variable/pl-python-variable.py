import pprint

import lxml.html
import pandas
import prairielearn as pl

NO_HIGHLIGHT_DEFAULT = False
PREFIX_DEFAULT = ""
SUFFIX_DEFAULT = ""
PREFIX_NEWLINE_DEFAULT = False
SUFFIX_NEWLINE_DEFAULT = False

# Pretty print parameters
INDENT_DEFAULT = 1
DEPTH_DEFAULT = None
WIDTH_DEFAULT = 80
COMPACT_DEFAULT = False
SORT_DICTS_DEFAULT = False

# Legacy dataframe parameters
TEXT_DEFAULT = False
SHOW_HEADER_DEFAULT = True
SHOW_INDEX_DEFAULT = True
SHOW_DIMENSIONS_DEFAULT = True
COPY_CODE_BUTTON_DEFAULT = False
SHOW_LINE_NUMBERS_DEFAULT = False


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(
        element,
        required_attribs=["params-name"],
        optional_attribs=[
            "no-highlight",
            "prefix",
            "suffix",
            "prefix-newline",
            "suffix-newline",
            "copy-code-button",
            "show-line-numbers",
            # Pretty print parameters
            "indent",
            "depth",
            "width",
            "compact",
            "sort-dicts",
            # Legacy dataframe parameters
            "text",
            "show-header",
            "show-index",
            "show-dimensions",
        ],
    )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)

    varname = pl.get_string_attrib(element, "params-name")
    no_highlight = pl.get_boolean_attrib(element, "no-highlight", NO_HIGHLIGHT_DEFAULT)
    prefix = pl.get_string_attrib(element, "prefix", PREFIX_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)

    # Pretty print parameters
    indent = pl.get_integer_attrib(element, "indent", INDENT_DEFAULT)
    depth = pl.get_integer_attrib(element, "depth", DEPTH_DEFAULT)
    width = pl.get_integer_attrib(element, "width", WIDTH_DEFAULT)
    compact = pl.get_boolean_attrib(element, "compact", COMPACT_DEFAULT)
    sort_dicts = pl.get_boolean_attrib(element, "sort-dicts", SORT_DICTS_DEFAULT)

    # Legacy dataframe parameters
    force_text = pl.get_boolean_attrib(element, "text", TEXT_DEFAULT)
    show_header = pl.get_boolean_attrib(element, "show-header", SHOW_HEADER_DEFAULT)
    show_index = pl.get_boolean_attrib(element, "show-index", SHOW_INDEX_DEFAULT)
    show_dimensions = pl.get_boolean_attrib(
        element, "show-dimensions", SHOW_DIMENSIONS_DEFAULT
    )

    if varname not in data["params"]:
        raise KeyError(
            f'Could not find {varname} in params. Please make sure to set params-name="{varname}" in the element.'
        )

    var_out = pl.from_json(data["params"][varname])

    # Passthrough legacy support for pl-dataframe
    if isinstance(var_out, pandas.DataFrame) and not force_text:
        return (
            f'<pl-dataframe params-name="{varname}" show-header="{show_header}" show-index="{show_index}" '
            f'show-dimensions="{show_dimensions}" show-python="false"></pl-dataframe>'
        )
    # Support pprint for complex data types
    elif isinstance(var_out, (dict, list)):
        var_string = pprint.pformat(
            var_out,
            indent=indent,
            width=width,
            depth=depth,
            compact=compact,
            sort_dicts=sort_dicts,
        )
    # Otherwise, just use repr
    else:
        var_string = repr(var_out)

    prefix_newline = pl.get_boolean_attrib(
        element, "prefix-newline", PREFIX_NEWLINE_DEFAULT
    )
    suffix_newline = pl.get_boolean_attrib(
        element, "suffix-newline", SUFFIX_NEWLINE_DEFAULT
    )
    copy_code_button = pl.get_boolean_attrib(
        element, "copy-code-button", COPY_CODE_BUTTON_DEFAULT
    )

    show_line_numbers = pl.get_boolean_attrib(
        element, "show-line-numbers", SHOW_LINE_NUMBERS_DEFAULT
    )

    if prefix_newline:
        prefix += "\n"
    if suffix_newline:
        suffix = "\n" + suffix

    language = "" if no_highlight else ' language="python"'

    return f'<pl-code{language} copy-code-button="{copy_code_button}" show-line-numbers="{show_line_numbers}">{prefix}{var_string}{suffix}</pl-code>'

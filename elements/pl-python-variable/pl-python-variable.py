import prairielearn as pl
import lxml.html
import pandas
from typing import cast, List, Any
from typing_extensions import reveal_type

NO_HIGHLIGHT_DEFAULT = False
PREFIX_DEFAULT = ''
SUFFIX_DEFAULT = ''
TEXT_DEFAULT = False
SHOW_HEADER_DEFAULT = True
SHOW_INDEX_DEFAULT = True
SHOW_DIMENSIONS_DEFAULT = True


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['params-name'], optional_attribs=[
        'text', 'no-highlight', 'prefix', 'suffix', 'show-header', 'show-index', 'show-dimensions', 'add-line-breaks'
    ])


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    force_text = pl.get_boolean_attrib(element, 'text', TEXT_DEFAULT)
    varname = pl.get_string_attrib(element, 'params-name')
    show_header = pl.get_boolean_attrib(element, 'show-header', SHOW_HEADER_DEFAULT)
    show_index = pl.get_boolean_attrib(element, 'show-index', SHOW_INDEX_DEFAULT)
    show_dimensions = pl.get_boolean_attrib(element, 'show-dimensions', SHOW_DIMENSIONS_DEFAULT)
    add_line_breaks = pl.has_attrib(element, 'add-line-breaks')

    if varname not in data['params']:
        raise Exception(f'Could not find {varname} in params!')

    var_out = data['params'][varname]

    # determine the type of variable to render
    if isinstance(var_out, dict) and '_type' in var_out:
        var_out = pl.from_json(var_out)

    html_list: List[str] = []

    # render the output variable
    if isinstance(var_out, pandas.DataFrame) and not force_text:
        frame = cast(pandas.DataFrame, var_out)
        html_list.append(frame.to_html(header=show_header, index=show_index, classes=['pl-python-variable-table']))
        if show_dimensions:
            html_list.append(f'<p class="pl-python-variable-table-dimensions">{frame.shape[0]} rows x {frame.shape[1]} columns</p>')
    else:
        no_highlight = pl.get_boolean_attrib(element, 'no-highlight', NO_HIGHLIGHT_DEFAULT)
        prefix = pl.get_string_attrib(element, 'prefix', PREFIX_DEFAULT)
        suffix = pl.get_string_attrib(element, 'suffix', SUFFIX_DEFAULT)

        var_string = get_var_string(var_out, add_line_breaks)

        html_list.append(f'<pl-code language="python" no-highlight="{no_highlight}">{prefix}{var_string}{suffix}</pl-code>')

    return ''.join(html_list)


def get_var_string(var: Any, add_line_breaks: bool) -> str:
    if add_line_breaks:
        if isinstance(var, dict):
            inner_string = ',\n'.join(f'    {repr(key)}: {repr(val)}' for key, val in var.items())
            return f'{{\n{inner_string}\n}}'

        elif isinstance(var, list):
            inner_string = ',\n'.join(f'    {repr(elem)}' for elem in var)
            return f'[\n{inner_string}\n]'

        raise ValueError(f"Line breaks not supported for type {type(var).__name__}")

    return repr(var)

import datetime
import os
from html import escape, unescape
from typing import Any, Generator, Iterable, Iterator, Optional

import chevron
import lxml.html
import prairielearn as pl
import pygments
import pygments.formatter
import pygments.formatters
import pygments.lexer
import pygments.lexers
import pygments.style
import pygments.util
from code_utils import parse_highlight_lines
from pygments.styles import STYLE_MAP, get_style_by_name
from pygments.token import Token, _TokenType
from pygments_ansi_color import color_tokens

LANGUAGE_DEFAULT = None
STYLE_DEFAULT = "friendly"
NO_HIGHLIGHT_DEFAULT = False
SOURCE_FILE_NAME_DEFAULT = None
PREVENT_SELECT_DEFAULT = False
HIGHLIGHT_LINES_DEFAULT = None
HIGHLIGHT_LINES_COLOR_DEFAULT = None
DIRECTORY_DEFAULT = "."
COPY_CODE_BUTTON_DEFAULT = False
SHOW_LINE_NUMBERS_DEFAULT = False

# These are the same colors used in pl-external-grader-result
ANSI_COLORS = {
    "Black": "#000000",
    "Red": "#c91b00",
    "Green": "#00c200",
    "Yellow": "#c7c400",
    "Blue": "#0037da",
    "Magenta": "#c930c7",
    "Cyan": "#00c5c7",
    "White": "#c7c7c7",
    "BrightBlack": "#676767",
    "BrightRed": "#ff6d67",
    "BrightGreen": "#5ff967",
    "BrightYellow": "#fefb67",
    "BrightBlue": "#6871ff",
    "BrightMagenta": "#ff76ff",
    "BrightCyan": "#5ffdff",
    "BrightWhite": "#feffff",
}

# Computing this is relatively expensive, so we'll do it once here and reuse it.
ansi_color_tokens = color_tokens(ANSI_COLORS, ANSI_COLORS)


class NoHighlightingLexer(pygments.lexer.Lexer):
    """
    Dummy lexer for when syntax highlighting is not wanted, but we still
    want to run it through the highlighter for styling and code escaping.
    """

    def __init__(self, **options: Any) -> None:
        pygments.lexer.Lexer.__init__(self, **options)
        self.compress = options.get("compress", "")

    def get_tokens_unprocessed(
        self, text: str
    ) -> Iterator[tuple[int, _TokenType, str]]:
        return iter([(0, Token.Text, text)])


class HighlightingHtmlFormatter(pygments.formatters.HtmlFormatter):
    """
    Subclass of the default HTML formatter to provide more flexibility
    with highlighted lines.
    """

    def set_highlight_lines(self, hl_lines: Optional[list[int]]) -> None:
        self.hl_lines.clear()
        if hl_lines:
            for line in hl_lines:
                self.hl_lines.add(line)

    def _highlight_lines(
        self, tokensource: Iterable[tuple[int, str]]
    ) -> Generator[tuple[int, str], None, None]:
        """
        Highlighted the lines specified in the `hl_lines` option by post-processing the token stream.
        Based on the code at "https://github.com/pygments/pygments/blob/master/pygments/formatters/html.py#L816"
        """
        for i, (t, value) in enumerate(tokensource):
            if t != 1:
                yield t, value
            if i + 1 in self.hl_lines:  # i + 1 because Python indexes start at 0
                yield (
                    1,
                    f'<span class="pl-code-highlighted-line" style="background-color: {self.style.highlight_color}">{value}</span>',
                )
            else:
                yield 1, value

    @property
    def _linenos_style(self) -> str:
        # All styling will be handled in CSS.
        return ""


_lexer_cache: dict[str, Optional[pygments.lexer.Lexer]] = {}


def get_lexer_by_name(name: str) -> Optional[pygments.lexer.Lexer]:
    """
    Tries to find a lexer by both its proper name and any aliases it has.
    """
    # Search by proper class/language names
    # This returns None if not found, and a class if found.

    # Selecting and instantiating a lexer is actually reasonably expensive
    # (on the order of ~5ms), with performance getting worse for language
    # names later in the alphabet. We cache lexers to avoid this cost if
    # `<pl-code>` is used multiple times in a question with the same language.
    if name in _lexer_cache:
        return _lexer_cache[name]

    lexer_class_start = datetime.datetime.now()
    lexer_class = pygments.lexers.find_lexer_class(name)
    lexer_class_end = datetime.datetime.now()
    print(f"found lexer class in {lexer_class_end - lexer_class_start}")
    if lexer_class is not None:
        # Instantiate the class if we found it
        _lexer_cache[name] = lexer_class()
    else:
        print("trying aliases")
        try:
            # Search by language aliases
            # This throws an Exception if it's not found, and returns an instance if found.
            _lexer_cache[name] = pygments.lexers.get_lexer_by_name(name)
        except pygments.util.ClassNotFound:
            _lexer_cache[name] = None

    return _lexer_cache[name]


_formatter_cache: dict[
    tuple[type[pygments.style.Style], Optional[str]], HighlightingHtmlFormatter
] = {}


def get_formatter(
    pygments_style: type[pygments.style.Style], highlight_lines_color: Optional[str]
):
    # Check cache first.
    formatter = _formatter_cache.get((pygments_style, highlight_lines_color), None)
    if formatter is not None:
        return formatter

    class CustomStyleWithAnsiColors(pygments_style):
        style2_start = datetime.datetime.now()
        styles = dict(pygments_style.styles)
        styles.update(ansi_color_tokens)
        style2_end = datetime.datetime.now()
        print(f"got style 2 in {style2_end - style2_start}")

        highlight_color = (
            pygments_style.highlight_color or highlight_lines_color or "#b3d7ff"
        )

    formatter_opts = {
        "style": CustomStyleWithAnsiColors,
        "nobackground": True,
        "noclasses": True,
        # We'll unconditionally render the line numbers, but we'll hide them if
        # they aren't specifically enabled. This means we only have to deal with
        # one markup "shape" in our CSS, not two.
        "linenos": "table",
    }

    formatter_start = datetime.datetime.now()
    formatter = HighlightingHtmlFormatter(**formatter_opts)
    formatter_end = datetime.datetime.now()

    print(f"constructed formatter in {formatter_end - formatter_start}")
    _formatter_cache[(pygments_style, highlight_lines_color)] = formatter
    return formatter


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = [
        "language",
        "no-highlight",  # Deprecated, accepted for backwards compatibility
        "source-file-name",
        "directory",
        "prevent-select",
        "highlight-lines",
        "highlight-lines-color",
        "copy-code-button",
        "style",
        "show-line-numbers",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)

    language = pl.get_string_attrib(element, "language", LANGUAGE_DEFAULT)
    if language is not None:
        lexer = get_lexer_by_name(language)
        if lexer is None:
            raise KeyError(
                f'Unknown language: "{language}". Must be one of the aliases listed in https://pygments.org/languages/, or the special language "ansi-color".'
            )

    style = pl.get_string_attrib(element, "style", STYLE_DEFAULT)
    allowed_styles = STYLE_MAP.keys()
    if style not in allowed_styles:
        raise KeyError(
            f'Unknown style: "{style}". Must be one of {", ".join(allowed_styles)}'
        )

    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )
    if source_file_name is not None:
        if element.text is not None and not str(element.text).isspace():
            raise ValueError(
                'Existing code cannot be added inside html element when "source-file-name" attribute is used.'
            )

    highlight_lines = pl.get_string_attrib(
        element, "highlight-lines", HIGHLIGHT_LINES_DEFAULT
    )
    if highlight_lines is not None:
        if parse_highlight_lines(highlight_lines) is None:
            raise ValueError(
                "Could not parse highlight-lines attribute; check your syntax"
            )


def render(element_html: str, data: pl.QuestionData) -> str:
    overall_start = datetime.datetime.now()

    # def print_elapsed_time():
    #     print(f"elapsed time: {datetime.datetime.now() - overall_start}")

    # attrs_start = datetime.datetime.now()
    element = lxml.html.fragment_fromstring(element_html)
    language = pl.get_string_attrib(element, "language", LANGUAGE_DEFAULT)
    style = pl.get_string_attrib(element, "style", STYLE_DEFAULT)
    source_file_name = pl.get_string_attrib(
        element, "source-file-name", SOURCE_FILE_NAME_DEFAULT
    )
    directory = pl.get_string_attrib(element, "directory", DIRECTORY_DEFAULT)
    prevent_select = pl.get_boolean_attrib(
        element, "prevent-select", PREVENT_SELECT_DEFAULT
    )
    highlight_lines = pl.get_string_attrib(
        element, "highlight-lines", HIGHLIGHT_LINES_DEFAULT
    )
    highlight_lines_color = pl.get_color_attrib(
        element, "highlight-lines-color", HIGHLIGHT_LINES_COLOR_DEFAULT
    )

    show_line_numbers = pl.get_boolean_attrib(
        element, "show-line-numbers", SHOW_LINE_NUMBERS_DEFAULT
    )

    # The no-highlight option is deprecated, but supported for backwards compatibility
    if pl.get_boolean_attrib(element, "no-highlight", NO_HIGHLIGHT_DEFAULT):
        language = None

    # attrs_end = datetime.datetime.now()
    # print(f"got attributes in {attrs_end - attrs_start}")
    # print_elapsed_time()

    # src_start = datetime.datetime.now()
    if source_file_name is not None:
        if directory == "serverFilesCourse":
            base_path = data["options"]["server_files_course_path"]
        elif directory == "clientFilesCourse":
            base_path = data["options"]["client_files_course_path"]
        else:
            base_path = os.path.join(data["options"]["question_path"], directory)
        file_path = os.path.join(base_path, source_file_name)
        if not os.path.exists(file_path):
            raise ValueError(f'Unknown file path: "{file_path}".')

        with open(file_path, "r") as f:
            code = f.read().removesuffix("\n").removesuffix("\r")

        # Automatically escape code in file source (important for: html/xml).
        code = escape(code)
    else:
        # Strip a single leading newline from the code, if present. This
        # avoids having spurious newlines because of HTML like:
        #
        # <pl-code>
        # some_code
        # </pl-code>
        #
        # which technically starts with a newline, but we probably
        # don't want a blank line at the start of the code block.
        code = pl.inner_html(element).removeprefix("\r").removeprefix("\n")
    # src_end = datetime.datetime.now()
    # print(f"got source in {src_end - src_start}")
    # print_elapsed_time()

    # lexer_start = datetime.datetime.now()
    lexer = NoHighlightingLexer() if language is None else get_lexer_by_name(language)
    # lexer_end = datetime.datetime.now()
    # print(f"got lexer in {lexer_end - lexer_start}")
    # print_elapsed_time()

    # style_start = datetime.datetime.now()
    pygments_style = get_style_by_name(style)
    # style_end = datetime.datetime.now()
    # print(f"got style in {style_end - style_start}")
    # print_elapsed_time()

    # formatter_start = datetime.datetime.now()
    background_color = pygments_style.background_color or "transparent"
    line_number_color = pygments_style.line_number_color

    formatter = get_formatter(pygments_style, highlight_lines_color)
    if highlight_lines is not None:
        formatter.set_highlight_lines(parse_highlight_lines(highlight_lines))
    else:
        formatter.set_highlight_lines(None)
    # formatter_end = datetime.datetime.now()
    # print(f"got formatter in {formatter_end - formatter_start}")
    # print_elapsed_time()

    # highlight_start = datetime.datetime.now()
    code = pygments.highlight(unescape(code), lexer, formatter)
    # highlight_end = datetime.datetime.now()
    # print(f"formatted code in {highlight_end - highlight_start}")
    # print_elapsed_time()

    # params_start = datetime.datetime.now()
    html_params = {
        "uuid": pl.get_uuid(),
        "code": code,
        "prevent_select": prevent_select,
        "background_color": background_color,
        "line_number_color": line_number_color,
        "show_line_numbers": show_line_numbers,
        "copy_code_button": pl.get_boolean_attrib(
            element, "copy-code-button", COPY_CODE_BUTTON_DEFAULT
        ),
    }
    # params_end = datetime.datetime.now()
    # print(f"got params in {params_end - params_start}")
    # print_elapsed_time()

    # with open("pl-code.mustache", "r", encoding="utf-8") as f:
    #     return chevron.render(f, html_params).strip()
    # read_start = datetime.datetime.now()
    f = open("pl-code.mustache", "r", encoding="utf-8").read()
    # read_end = datetime.datetime.now()
    # print(f"read mustache in {read_end - read_start}")
    # print_elapsed_time()

    # html_start = datetime.datetime.now()
    rendered_html = chevron.render(f, html_params).strip()
    # html_end = datetime.datetime.now()
    # print(f"rendered html in {html_end - html_start}")
    # print_elapsed_time()

    overall_end = datetime.datetime.now()
    # print(f"overall time taken: {overall_end - overall_start}")
    # print_elapsed_time()

    return rendered_html

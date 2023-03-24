import os
from html import escape, unescape
from typing import Any, Generator, Iterable, Optional, Type

from code_utils import parse_highlight_lines
import chevron
import lxml.html
import prairielearn as pl
import pygments
import pygments.formatters
import pygments.lexer
import pygments.lexers
import pygments.util
from pygments.styles import STYLE_MAP, get_style_by_name
from pygments.token import Token
from pygments_ansi_color import color_tokens

LANGUAGE_DEFAULT = None
STYLE_DEFAULT = "friendly"
NO_HIGHLIGHT_DEFAULT = False
SOURCE_FILE_NAME_DEFAULT = None
PREVENT_SELECT_DEFAULT = False
HIGHLIGHT_LINES_DEFAULT = None
HIGHLIGHT_LINES_COLOR_DEFAULT = "#b3d7ff"
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


class NoHighlightingLexer(pygments.lexer.Lexer):
    """
    Dummy lexer for when syntax highlighting is not wanted, but we still
    want to run it through the highlighter for styling and code escaping.
    """

    def __init__(self, **options: Any) -> None:
        pygments.lexer.Lexer.__init__(self, **options)
        self.compress = options.get("compress", "")

    def get_tokens_unprocessed(self, text: str) -> list[tuple[int, Type, str]]:
        return [(0, Token.Text, text)]


class HighlightingHtmlFormatter(pygments.formatters.HtmlFormatter):
    """
    Subclass of the default HTML formatter to provide more flexibility
    with highlighted lines.
    """

    def __init__(self, **options: Any) -> None:
        pygments.formatters.HtmlFormatter.__init__(self, **options)
        self.hl_color = options.get("hl_color", HIGHLIGHT_LINES_COLOR_DEFAULT)

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
                yield 1, f'<span class="pl-code-highlighted-line" style="background-color: {self.hl_color}">{value}</span>'
            else:
                yield 1, value

    @property
    def _linenos_style(self) -> str:
        """
        Change style used to wrap tags associated with line numbers to avoid them being picked up when copying.
        Based on code at https://github.com/pygments/pygments/blob/master/pygments/formatters/html.py#L596-L601
        """
        return f"""
            color: {self.style.line_number_color};
            background-color: {self.style.line_number_background_color};
            padding-left: 5px;
            padding-right: 5px;
            -webkit-user-select: none;
            -ms-user-select: none;
            user-select: none;
        """


def get_lexer_by_name(name: str) -> Optional[pygments.lexer.Lexer]:
    """
    Tries to find a lexer by both its proper name and any aliases it has.
    """
    # Search by proper class/language names
    # This returns None if not found, and a class if found.
    lexer_class = pygments.lexers.find_lexer_class(name)
    if lexer_class is not None:
        # Instantiate the class if we found it
        return lexer_class()
    else:
        try:
            # Search by language aliases
            # This throws an Exception if it's not found, and returns an instance if found.
            return pygments.lexers.get_lexer_by_name(name)
        except pygments.util.ClassNotFound:
            return None


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
            allowed_languages = map(
                lambda tup: tup[1][0], pygments.lexers.get_all_lexers()
            )
            raise KeyError(
                f'Unknown language: "{language}". Must be one of {", ".join(allowed_languages)}'
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
    highlight_lines_color = pl.get_string_attrib(
        element, "highlight-lines-color", HIGHLIGHT_LINES_COLOR_DEFAULT
    )

    show_line_numbers = pl.get_boolean_attrib(
        element, "show-line-numbers", SHOW_LINE_NUMBERS_DEFAULT
    )

    # The no-highlight option is deprecated, but supported for backwards compatibility
    if pl.get_boolean_attrib(element, "no-highlight", NO_HIGHLIGHT_DEFAULT):
        language = None

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

    lexer = NoHighlightingLexer() if language is None else get_lexer_by_name(language)

    pygments_style = get_style_by_name(style)

    class CustomStyleWithAnsiColors(pygments_style):  # type: ignore
        styles = dict(pygments_style.styles)
        styles.update(color_tokens(ANSI_COLORS, ANSI_COLORS))

    formatter_opts = {
        "style": CustomStyleWithAnsiColors,
        "cssclass": "mb-2 rounded",
        "prestyles": "padding: 0.5rem; margin-bottom: 0px",
        "noclasses": True,
    }

    if highlight_lines is not None:
        formatter_opts["hl_lines"] = parse_highlight_lines(highlight_lines)
        formatter_opts["hl_color"] = highlight_lines_color

    if show_line_numbers:
        formatter_opts["linenos"] = "inline"

    formatter = HighlightingHtmlFormatter(**formatter_opts)

    code = pygments.highlight(unescape(code), lexer, formatter)

    html_params = {
        "uuid": pl.get_uuid(),
        "code": code,
        "prevent_select": prevent_select,
        "copy_code_button": pl.get_boolean_attrib(
            element, "copy-code-button", COPY_CODE_BUTTON_DEFAULT
        ),
    }

    with open("pl-code.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()

import base64
import importlib

import pytest

rich_text_editor = importlib.import_module("pl-rich-text-editor")


def _to_b64(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("utf-8")


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("", 0),
        ("hello world", 2),
        ("<p>hello <strong>world</strong></p>", 2),
        ("hello  \t\tworld\n\nfrom\r\f\vpl", 4),
        ("hello&nbsp;&nbsp;world&#160;&#xA0;\u00a0from", 3),
        ("  hello world  ", 2),
        (
            "this is a longer plain text sentence that contains many words and should still be counted correctly",
            17,
        ),
        (
            "<div>this <em>longer</em> html string <span>contains several words</span> with <strong>mixed formatting</strong> across tags</div>",
            12,
        ),
        (
            "\n\n  leading spaces and lines\t\twith multiple\n\nseparators between words\r\f\vthroughout the content   ",
            12,
        ),
        (
            "<p>alpha&nbsp;&nbsp;&nbsp;beta&#160;gamma&#xA0;delta</p><p>epsilon \u00a0 zeta eta theta</p>",
            8,
        ),
        (
            "<section>start <b>with</b> many words and end with trailing spaces in a long example string for counting</section>    ",
            16,
        ),
    ],
)
def test_count_words_from_html_base64(html: str, expected: int) -> None:
    assert rich_text_editor.count_words_from_html_base64(_to_b64(html)) == expected

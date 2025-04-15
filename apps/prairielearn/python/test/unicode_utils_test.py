import pytest
from prairielearn.misc_utils import escape_unicode_string, full_unidecode


@pytest.mark.parametrize(
    ("input_str", "expected"),
    [
        ("café", "cafe"),
        ("naïve", "naive"),
        ("−5", "-5"),  # Unicode minus to normal minus  # noqa: RUF001
        ("résumé", "resume"),
        ("über", "uber"),
        ("test", "test"),
    ],
)
def test_full_unidecode_parametrized(input_str: str, expected: str):
    assert full_unidecode(input_str) == expected


@pytest.mark.parametrize(
    ("input_str", "expected"),
    [
        ("hello\u200bworld", "hello<U+200b>world"),  # Zero-width space
        ("control\u0001char", "control<U+1>char"),  # Control character
        ("test\u200etext", "test<U+200e>text"),  # Left-to-right mark
        ("\n", "<U+a>"),  # Newline
        ("", ""),
        ("a\u200bb\u200f", "a<U+200b>b<U+200f>"),
        ("normal text", "normal text"),
    ],
)
def test_escape_unicode_string_parametrized(input_str: str, expected: str):
    assert escape_unicode_string(input_str) == expected

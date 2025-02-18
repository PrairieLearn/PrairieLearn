from prairielearn.unicode_utils import escape_unicode_string, full_unidecode


def test_full_unidecode():
    assert full_unidecode("café") == "cafe"
    assert full_unidecode("naïve") == "naive"
    assert full_unidecode("−5") == "-5"  # Unicode minus to normal minus  # noqa: RUF001
    assert full_unidecode("résumé") == "resume"
    assert full_unidecode("über") == "uber"
    assert full_unidecode("test") == "test"


def test_escape_unicode_string():
    assert escape_unicode_string("hello") == "hello"
    assert (
        escape_unicode_string("hello\u200bworld") == "hello<U+200b>world"
    )  # Zero-width space
    assert (
        escape_unicode_string("control\u0001char") == "control<U+1>char"
    )  # Control character

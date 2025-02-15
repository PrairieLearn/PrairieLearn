from enum import Enum

import lxml.html
import prairielearn.attribute_utils as pl
import pytest


class DummyEnum(Enum):
    DEFAULT = 0
    DUMMY_CHOICE_1 = 1
    DUMMY_CHOICE_2 = 2
    DUMMY_CHOICE_3 = 3


@pytest.mark.parametrize(
    ("html_str", "expected_result"),
    [
        ("<pl-thing></pl-thing>", DummyEnum.DEFAULT),
        ('<pl-thing test-choice="default"></pl-thing>', DummyEnum.DEFAULT),
        (
            '<pl-thing test-choice="dummy-choice-1"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_1,
        ),
        (
            '<pl-thing test-choice="dummy-choice-2"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_2,
        ),
        (
            '<pl-thing test-choice="dummy-choice-3"></pl-thing>',
            DummyEnum.DUMMY_CHOICE_3,
        ),
    ],
)
def test_get_enum_attrib(html_str: str, expected_result: DummyEnum) -> None:
    element = lxml.html.fragment_fromstring(html_str)
    result = pl.get_enum_attrib(element, "test-choice", DummyEnum, DummyEnum.DEFAULT)

    assert result is expected_result


@pytest.mark.parametrize(
    "html_str",
    [
        "<pl-thing></pl-thing>",
        '<pl-thing test-choice="DEFAULT"></pl-thing>',
        '<pl-thing test-choice="Default"></pl-thing>',
        '<pl-thing test-choice="dummy_choice_1"></pl-thing>',
    ],
)
def test_get_enum_attrib_exceptions(html_str: str) -> None:
    element = lxml.html.fragment_fromstring(html_str)

    with pytest.raises(ValueError):  # noqa: PT011
        pl.get_enum_attrib(element, "test-choice", DummyEnum)

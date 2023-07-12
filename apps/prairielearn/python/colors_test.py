import pytest
from coloraide import Color as Base
from colors import PLColor, get_css_color


@pytest.mark.parametrize(
    "color, expected",
    [
        ("red", "#ff0000"),
        ("RED", "#ff0000"),
        ("correct_green", "#008c31"),
        ("none", None),
    ],
)
def test_get_css_color(color: str, expected: str | None) -> None:
    """
    Assert the get_css_color method returns hex strings if given valid input.

    Note that the new color constructor `PLColor(...)` is preferred.
    """
    assert get_css_color(color) == expected


@pytest.mark.parametrize(
    "color, expected",
    [("red", Base("srgb", [1, 0, 0], 1)), ("RED", Base("srgb", [1, 0, 0], 1))],
)
def test_color_constructor(color: str, expected: str) -> None:
    """Assert the color constructor returns a color object if given valid input."""
    assert PLColor(color) == expected


def test_color_constructor_custom() -> None:
    """Assert the color constructor can handle custom colors."""
    assert PLColor("correct_green") == PLColor("green3")


def test_color_constructor_error() -> None:
    """Assert the color constructor raises a ValueError if given invalid input."""
    with pytest.raises(ValueError):
        PLColor("none")


@pytest.mark.parametrize(
    "color",
    [
        "red",
        "RED",
        "correct_green",
    ],
)
def test_color_match_is_not_none(color: str) -> None:
    """
    Assert the custom color match method returns a color object
    """
    assert PLColor.match(color) is not None


@pytest.mark.parametrize(
    "invalid_color",
    [
        "none",
        "another_random_color",
    ],
)
def test_color_match(invalid_color: str) -> None:
    """
    Assert the custom color match method returns None for invalid colors.
    """
    assert PLColor.match(invalid_color) is None

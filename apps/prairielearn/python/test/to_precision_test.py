import pytest
from prairielearn.to_precision import Notation, to_precision


@pytest.mark.parametrize(
    ("value", "precision", "notation", "expected"),
    [
        # Standard notation (auto selection for small numbers)
        (5.123, 2, "auto", "5.1"),
        (5.123, 3, "auto", "5.12"),
        (5.123, 4, "auto", "5.123"),
        (0.0123, 2, "auto", "0.012"),
        # Scientific notation
        (123.456, 3, "sci", "1.23e2"),
        (0.00123, 2, "sci", "1.2e-3"),
        (-123.456, 3, "sci", "-1.23e2"),
        # Engineering notation
        (123.456, 3, "eng", "123e0"),
        (1234.56, 3, "eng", "1.23e3"),
        (0.00123, 2, "eng", "1.2e-3"),
        # Standard notation (forced)
        (123.456, 3, "std", "123"),
        (0.123456, 3, "std", "0.123"),
        (-123.456, 3, "std", "-123"),
        # Edge cases
        (0, 3, "auto", "0.00"),
        (0, 3, "sci", "0.00e0"),
        (1e10, 3, "auto", "1.00e10"),
        (1.23, 1, "auto", "1"),
        (1e-15, 3, "auto", "0.00000000000000100"),
        (1.23456789, 10, "auto", "1.234567890"),
    ],
)
def test_to_precision(
    value: float, precision: int, notation: Notation, expected: str
) -> None:
    """Test conversion to specified precision and notation."""
    result = to_precision(value, precision, notation)
    assert result == expected


def test_to_precision_invalid_notation() -> None:
    """Test that invalid notation raises an error."""
    with pytest.raises(AssertionError):
        to_precision(1.23, 2, "invalid")  # type: ignore


def test_to_precision_different_filler() -> None:
    """Test using different filler character between mantissa and exponent."""
    result = to_precision(123.456, 3, "sci", "E")
    assert result == "1.23E2"

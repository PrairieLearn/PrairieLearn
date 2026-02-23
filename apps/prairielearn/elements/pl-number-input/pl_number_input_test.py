import importlib

import pytest

number_input = importlib.import_module("pl-number-input")


@pytest.mark.parametrize(
    ("number_string", "expected_precision"),
    [
        ("42", 1),
        ("420", 10),
        ("420.", 1),
        ("420.6", 0.1),
        ("420.69", 0.01),
        ("420.691", 0.001),
        ("420.6913", 0.0001),
        ("420.69133", 0.00001),
        ("420.691337", 0.000001),
    ],
)
def test_only_string_precision_fn(
    number_string: str, expected_precision: float
) -> None:
    precision = number_input.get_string_precision(number_string)
    assert precision == expected_precision


@pytest.mark.parametrize(
    ("number_string", "expected_significant_digits"),
    [
        # Has decimal, non-zero digits remain after lstrip("0")
        ("420.690", 6),
        ("0.0001", 1),
        ("100.00", 5),
        # Has decimal, all digits are zero (frac_part non-empty)
        ("0.000", 3),
        # Has decimal, all digits are zero (frac_part empty, e.g. "0.")
        ("0.", 1),
        # No decimal, non-zero digits remain after strip("0")
        ("420", 2),
        ("04", 1),
        # No decimal, all zeros
        ("0", 1),
        # Sign stripping
        ("-1.0", 2),
    ],
)
def test_only_significant_digits_fn(
    number_string: str, expected_significant_digits: float
) -> None:
    precision = number_input.get_string_significant_digits(number_string)
    assert precision == expected_significant_digits


@pytest.mark.parametrize(
    ("number_string", "expected_decimal_digits"),
    [
        ("4", 0),
        ("42", 0),
        ("420", 0),
        ("420.", 0),
        ("420.6", 1),
        ("420.69", 2),
        ("420.690", 3),
        ("04", 0),
        ("40", 0),
        ("404", 0),
        ("0.0001", 1),
        ("0.000690", 3),
    ],
)
def test_only_decimal_digits_fn(
    number_string: str, expected_decimal_digits: float
) -> None:
    precision = number_input.get_string_decimal_digits(number_string)
    assert precision == expected_decimal_digits

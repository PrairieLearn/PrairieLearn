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
        # Scientific notation (expanded via Decimal, e.g. "1.5e-3" -> "0.0015")
        ("1e-3", 0.001),
        ("1.5e-3", 0.0001),
        ("1.50e-3", 0.00001),
        ("1e2", 100),
        ("1.0e2", 100),
        # Sign + scientific notation
        ("+1.5e-3", 0.0001),
        ("-1.5e-3", 0.0001),
        # Fractions
        ("1/3", 0.0),
        ("2/7", 0.0),
        # Whitespace
        (" 42.5 ", 0.1),
        # Unicode minus
        ("\u221242.5", 0.1),
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
        # Scientific notation (expanded via Decimal, e.g. "1.5e+2" -> "150")
        ("1e-3", 1),
        ("1.5e+2", 2),
        ("1.50e-3", 3),
        ("1.00e5", 1),
        ("-2.5e3", 2),
        # Fractions (return large value to avoid precision warnings)
        ("1/3", 1000),
        ("2/7", 1000),
        # Whitespace
        (" 420.690 ", 6),
        # Unicode minus
        ("\u2212420.690", 6),
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
        # Scientific notation (expanded via Decimal, e.g. "1.5e-3" -> "0.0015")
        ("1e-3", 1),
        ("1.5e-3", 2),
        ("0.0015", 2),
        ("1.50e-3", 3),
        ("-1.50e-3", 3),
        # Fractions (return large value to avoid precision warnings)
        ("1/3", 1000),
        ("2/7", 1000),
        # Whitespace
        (" 420.69 ", 2),
        # Unicode minus
        ("\u2212420.69", 2),
    ],
)
def test_only_decimal_digits_fn(
    number_string: str, expected_decimal_digits: float
) -> None:
    precision = number_input.get_string_decimal_digits(number_string)
    assert precision == expected_decimal_digits

import math
from typing import Optional

import pytest
import unit_utils as uu
from pint import UnitRegistry


@pytest.fixture(scope="module")
def ureg() -> UnitRegistry:
    return UnitRegistry()


@pytest.mark.parametrize(
    "a_true, a_sub, expected_grade",
    [
        ("m", "m", True),
        ("m", "meter", True),
        ("m", "meters", True),
        ("ft", "foot", True),
        ("ft", "feet", True),
        ("ft/s", "feet per second", True),
        ("m", "cm", False),
        ("ft", "feet/s", False),
    ],
)
def test_only_units_grading_fn(
    ureg: UnitRegistry, a_true: str, a_sub: str, expected_grade: bool
) -> None:
    grading_fn = uu.get_only_units_grading_fn(ureg=ureg, correct_ans=a_true)
    score, _ = grading_fn(a_sub)
    assert score == expected_grade


@pytest.mark.parametrize(
    "a_true, a_sub, rtol, atol, expected_grade",
    [
        ("1m", "1 meter", 0.0, "1cm", True),
        ("1m", "1.009 meter", 0.0, "1cm", True),
        ("1m", "3.28 feet", 0.0, "1cm", True),
        ("1m", "1.010001 meters", 0.02, "0m", True),
        ("1m", "1.2 meters", 0.1, "0.1m", True),
        ("1m", "1.21 meters", 0.1, "0.1m", False),
        ("1 kilofoot", "1.2 kilofeet", 0.1, "0.1kft", True),
        ("1 kilofoot", "1.21 kilofeet", 0.1, "0.1kft", False),
        ("1m", "1.010001 meters", 0.0, "1cm", False),
        ("1m", "1 foot", 0.0, "1cm", False),
        ("1m", "1 m/s", 0.0, "1cm", False),
        ("1m", "1 second", 0.0, "1cm", False),
        ("1m", "1 us", 0.0, "1cm", False),
    ],
)
def test_with_units_grading_fn(
    ureg: UnitRegistry,
    a_true: str,
    a_sub: str,
    rtol: float,
    atol: str,
    expected_grade: bool,
) -> None:
    grading_fn = uu.get_with_units_grading_fn(
        ureg=ureg, correct_ans=a_true, rtol=rtol, atol=atol
    )
    score, _ = grading_fn(a_sub)
    assert score == expected_grade


@pytest.mark.parametrize(
    "a_true, partial_credit, a_sub, expected_grade",
    [
        ("1m", None, "1m", 1.0),
        ("1m", None, "1 meter", 1.0),
        ("1m", 0.5, "1 meter", 1.0),
        ("1m", None, "1 foot", 0.0),
        ("1m", 0.42, "1 foot", 0.42),
        ("1m", None, "2 meters", 0.0),
        ("1m", 0.6, "2 meters", 0.4),
    ],
)
def test_exact_units_grading_fn(
    ureg: UnitRegistry,
    a_true: str,
    partial_credit: Optional[float],
    a_sub: str,
    expected_grade: float,
) -> None:
    grading_fn = uu.get_exact_units_grading_fn(
        ureg=ureg,
        correct_ans=a_true,
        comparison=uu.ComparisonType.EXACT,
        magnitude_partial_credit=partial_credit,
        # These parameters don't matter in this grading mode
        digits=2,
        rtol=0.0,
        atol="0.0",
    )

    score, _ = grading_fn(a_sub)
    assert math.isclose(score, expected_grade)


@pytest.mark.parametrize(
    "a_sub, expected_result",
    [
        ("m", True),
        ("feet", True),
        ("cm", True),
        ("1m", False),
        ("2m", False),
        ("2 feet", False),
    ],
)
def test_is_numberless(ureg: UnitRegistry, a_sub: str, expected_result: bool) -> None:
    assert expected_result == uu.is_numberless(a_sub, ureg.Quantity(a_sub))

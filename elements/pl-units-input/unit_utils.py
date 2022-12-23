from enum import Enum
from typing import Callable, Optional, Tuple

import prairielearn as pl
from pint import Quantity, UnitRegistry
from typing_extensions import assert_never


class ComparisonType(Enum):
    RELABS = "relabs"
    SIGFIG = "sigfig"
    EXACT = "exact"
    DECDIG = "decdig"


def get_units_only_grading_fn(
    *, ureg: UnitRegistry, correct_ans: str
) -> Callable[[str], Tuple[bool, Optional[str]]]:
    """Returns the grading function used for units only grading mode."""
    parsed_correct_ans = ureg.Quantity(correct_ans)

    def grade_units_only(submitted_ans: str) -> Tuple[bool, Optional[str]]:
        parsed_submission = ureg.Quantity(submitted_ans)
        if parsed_correct_ans.units == parsed_submission.units:
            return True, None

        return False, "Your answer is incorrect."

    return grade_units_only


def get_units_fixed_grading_fn(
    *,
    ureg: UnitRegistry,
    correct_ans: str,
    comparison: ComparisonType,
    digits: int,
    rtol: float,
    atol: str,
) -> Callable[[str], Tuple[float, Optional[str]]]:

    parsed_correct_ans = ureg.Quantity(correct_ans)
    parsed_atol = ureg.Quantity(atol)

    def magnitude_comparison_fn(
        submitted_magnitude: float, correct_magnitude: float
    ) -> bool:
        """Returns true if submitted_magnitude is close enough to correct_magnitude based on comparison algorithm"""
        if comparison is ComparisonType.EXACT:
            return submitted_magnitude == correct_magnitude
        elif comparison is ComparisonType.SIGFIG:
            return pl.is_correct_scalar_sf(
                submitted_magnitude, correct_magnitude, digits
            )
        elif comparison is ComparisonType.DECDIG:
            return pl.is_correct_scalar_dd(
                submitted_magnitude, correct_magnitude, digits
            )
        elif comparison is ComparisonType.RELABS:
            return pl.is_correct_scalar_ra(
                submitted_magnitude, correct_magnitude, rtol, parsed_atol.magnitude
            )

        assert_never(comparison)

    def grade_units_fixed(submitted_ans: str) -> Tuple[float, Optional[str]]:
        # will return no error, assuming parse() catches all of them
        parsed_submission = ureg.Quantity(submitted_ans)
        magnitudes_match = magnitude_comparison_fn(
            parsed_submission.magnitude, parsed_correct_ans.magnitude
        )
        units_match = parsed_correct_ans.units == parsed_submission.units

        if magnitudes_match and units_match:
            return 1.0, None
        elif magnitudes_match and not units_match:
            return (
                0.7,
                "The magnitude of your answer is correct, but your units are incorrect.",
            )
        elif units_match and not magnitudes_match:
            return (
                0.3,
                "Your answer has correct units, but the magnitude does not match the reference solution.",
            )

        return 0.0, "Your answer has incorrect units and magnitude."

    return grade_units_fixed


def get_units_agnostic_grading_fn(
    *, ureg: UnitRegistry, correct_ans: str, rtol: float, atol: str
) -> Callable[[str], Tuple[float, Optional[str]]]:
    # Assume atol and correct answer have same dimensionality, checked in prepare method
    correct_ans_base_unit = ureg.Quantity(correct_ans).to_base_units()
    parsed_atol = ureg.Quantity(atol).to_base_units()

    def grade_units_fixed(submitted_ans: str) -> Tuple[float, Optional[str]]:
        # will return no error, assuming parse() catches all of them
        parsed_sub_base_unit = ureg.Quantity(submitted_ans).to_base_units()

        if not correct_ans_base_unit.check(parsed_sub_base_unit.dimensionality):
            return 0.0, (
                f"Your answer has dimensionality <code>{parsed_sub_base_unit.dimensionality}</code>, "
                f"which is inconsistent with <code>{correct_ans_base_unit.dimensionality}</code>."
            )

        magnitudes_match = pl.is_correct_scalar_ra(
            parsed_sub_base_unit.magnitude,
            correct_ans_base_unit.magnitude,
            rtol,
            parsed_atol.magnitude,
        )

        if not magnitudes_match:
            return 0.0, "Your answer is incorrect."

        return 1.0, None

    return grade_units_fixed


def is_numberless(a_sub: str, a_sub_parsed: Quantity) -> bool:
    return "1" not in a_sub and a_sub_parsed.magnitude == 1

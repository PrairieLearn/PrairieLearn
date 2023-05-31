from enum import Enum
from typing import Any, Callable, Optional, Tuple

import numpy as np
import prairielearn as pl
from pint import UnitRegistry
from typing_extensions import assert_never

CORRECT_UNITS_INCORRECT_MAGNITUDE_FEEDBACK = (
    "Your answer has correct units, but incorrect magnitude."
)
INCORRECT_UNITS_CORRECT_MAGNITUDE_FEEDBACK = (
    "Your answer has correct magnitude, but incorrect units."
)
INCORRECT_UNITS_AND_MAGNITUDE_FEEDBACK = (
    "Your answer has incorrect units and magnitude."
)
INCORRECT_FEEDBACK = "Your answer is incorrect."


class ComparisonType(Enum):
    RELABS = "relabs"
    SIGFIG = "sigfig"
    EXACT = "exact"
    DECDIG = "decdig"


def get_only_units_grading_fn(
    *, ureg: UnitRegistry, correct_ans: str
) -> Callable[[str], Tuple[bool, Optional[str]]]:
    """Returns the grading function used for units only grading mode."""
    parsed_correct_ans = ureg.Quantity(correct_ans)

    def grade_only_units(submitted_ans: str) -> Tuple[bool, Optional[str]]:
        parsed_submission = ureg.Quantity(submitted_ans)
        if parsed_correct_ans.units == parsed_submission.units:
            return True, None

        return False, INCORRECT_FEEDBACK

    return grade_only_units


def get_exact_units_grading_fn(
    *,
    ureg: UnitRegistry,
    correct_ans: str,
    comparison: ComparisonType,
    magnitude_partial_credit: Optional[float],
    digits: int,
    rtol: float,
    atol: str,
) -> Callable[[str], Tuple[float, Optional[str]]]:
    parsed_correct_ans = ureg.Quantity(correct_ans)
    parsed_atol = ureg.Quantity(atol)

    def magnitude_comparison_fn(
        submitted_magnitude: float, correct_magnitude: float
    ) -> bool:
        submitted_magnitude_parsed = np.float64(submitted_magnitude)
        correct_magnitude_parsed = np.float64(correct_magnitude)

        """Returns true if submitted_magnitude is close enough to correct_magnitude based on comparison algorithm"""
        if comparison is ComparisonType.EXACT:
            return submitted_magnitude_parsed == correct_magnitude_parsed
        elif comparison is ComparisonType.SIGFIG:
            return pl.is_correct_scalar_sf(
                a_sub=submitted_magnitude_parsed,
                a_tru=correct_magnitude_parsed,
                digits=digits,
            )
        elif comparison is ComparisonType.DECDIG:
            return pl.is_correct_scalar_dd(
                a_sub=submitted_magnitude_parsed,
                a_tru=correct_magnitude_parsed,
                digits=digits,
            )
        elif comparison is ComparisonType.RELABS:
            return pl.is_correct_scalar_ra(
                a_sub=submitted_magnitude_parsed,
                a_tru=correct_magnitude_parsed,
                rtol=rtol,
                atol=parsed_atol.magnitude,
            )

        assert_never(comparison)

    magnitudes_match_credit = (
        magnitude_partial_credit if magnitude_partial_credit is not None else 0.0
    )
    units_match_credit = (
        (1.0 - magnitude_partial_credit)
        if magnitude_partial_credit is not None
        else 0.0
    )

    def grade_exact_units(submitted_ans: str) -> Tuple[float, Optional[str]]:
        # will return no error, assuming parse() catches all of them
        parsed_submission = ureg.Quantity(submitted_ans)
        magnitudes_match = magnitude_comparison_fn(
            parsed_submission.magnitude, parsed_correct_ans.magnitude
        )
        units_match = parsed_correct_ans.units == parsed_submission.units

        if magnitudes_match and units_match:
            return 1.0, None
        elif magnitudes_match and not units_match:
            return magnitudes_match_credit, INCORRECT_UNITS_CORRECT_MAGNITUDE_FEEDBACK
        elif units_match and not magnitudes_match:
            return units_match_credit, CORRECT_UNITS_INCORRECT_MAGNITUDE_FEEDBACK

        return 0.0, INCORRECT_UNITS_AND_MAGNITUDE_FEEDBACK

    return grade_exact_units


def get_with_units_grading_fn(
    *, ureg: UnitRegistry, correct_ans: str, rtol: float, atol: str
) -> Callable[[str], Tuple[bool, Optional[str]]]:
    # Assume atol and correct answer have same dimensionality, checked in prepare method
    correct_ans_base_unit = ureg.Quantity(correct_ans).to_base_units()
    parsed_atol = ureg.Quantity(atol).to_base_units()

    def grade_with_units(submitted_ans: str) -> Tuple[bool, Optional[str]]:
        # will return no error, assuming parse() catches all of them
        parsed_sub_base_unit = ureg.Quantity(submitted_ans).to_base_units()

        if not correct_ans_base_unit.check(parsed_sub_base_unit.dimensionality):
            return False, (
                f"Your answer has dimensionality <code>{parsed_sub_base_unit.dimensionality}</code>, "
                f"which is inconsistent with <code>{correct_ans_base_unit.dimensionality}</code>."
            )

        magnitudes_match = pl.is_correct_scalar_ra(
            a_sub=np.float64(parsed_sub_base_unit.magnitude),
            a_tru=np.float64(correct_ans_base_unit.magnitude),
            rtol=rtol,
            atol=parsed_atol.magnitude,
        )

        if magnitudes_match:
            return True, None

        return False, INCORRECT_FEEDBACK

    return grade_with_units


def is_numberless(a_sub: str, a_sub_parsed: Any) -> bool:
    return "1" not in a_sub and a_sub_parsed.magnitude == 1

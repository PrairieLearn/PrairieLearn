"""Utilities for grading and comparing answers in PrairieLearn.

```python
from prairielearn import ... # recommended
from prairielearn.grading_utils import ... # unstable, not recommended
```
"""

import math
from collections.abc import Callable
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
from numpy.typing import ArrayLike
from typing_extensions import assert_never

from prairielearn.misc_utils import QuestionData


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_dd(*args: Any, **kwargs: Any) -> bool:  # noqa: N802
    return is_correct_ndarray2d_dd(*args, **kwargs)


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_sf(*args: Any, **kwargs: Any) -> bool:  # noqa: N802
    return is_correct_ndarray2d_sf(*args, **kwargs)


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_ra(*args: Any, **kwargs: Any) -> bool:  # noqa: N802
    return is_correct_ndarray2d_ra(*args, **kwargs)


def is_correct_ndarray2d_dd(
    a_sub: npt.NDArray[Any], a_tru: npt.NDArray[Any], digits: int = 2
) -> bool:
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(m):
        for j in range(n):
            if not is_correct_scalar_dd(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2d_sf(
    a_sub: npt.NDArray[Any], a_tru: npt.NDArray[Any], digits: int = 2
) -> bool:
    # Check if each element is correct
    m = a_sub.shape[0]
    n = a_sub.shape[1]
    for i in range(m):
        for j in range(n):
            if not is_correct_scalar_sf(a_sub[i, j], a_tru[i, j], digits):
                return False

    # All elements were close
    return True


def is_correct_ndarray2d_ra(
    a_sub: npt.NDArray[Any],
    a_tru: npt.NDArray[Any],
    rtol: float = 1e-5,
    atol: float = 1e-8,
) -> bool:
    # Check if each element is correct
    return np.allclose(a_sub, a_tru, rtol, atol)


def is_correct_scalar_ra(
    a_sub: ArrayLike, a_tru: ArrayLike, rtol: float = 1e-5, atol: float = 1e-8
) -> bool:
    """Compare a_sub and a_tru using relative tolerance rtol and absolute tolerance atol."""
    return bool(np.allclose(a_sub, a_tru, rtol, atol))


def is_correct_scalar_dd(a_sub: ArrayLike, a_tru: ArrayLike, digits: int = 2) -> bool:
    """Compare a_sub and a_tru using digits many digits after the decimal place."""
    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        real_comp = is_correct_scalar_dd(a_sub.real, a_tru.real, digits=digits)  # type: ignore
        imag_comp = is_correct_scalar_dd(a_sub.imag, a_tru.imag, digits=digits)  # type: ignore
        return real_comp and imag_comp

    if np.abs(a_tru) == math.inf:
        return a_sub == a_tru
    elif np.isnan(a_tru):
        return np.isnan(a_sub)  # type: ignore
    # Get bounds on submitted answer
    eps = 0.51 * (10**-digits)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return bool((a_sub > lower_bound) & (a_sub < upper_bound))


def is_correct_scalar_sf(a_sub: ArrayLike, a_tru: ArrayLike, digits: int = 2) -> bool:
    """Compare a_sub and a_tru using digits many significant figures."""
    # If answers are complex, check real and imaginary parts separately
    if np.iscomplexobj(a_sub) or np.iscomplexobj(a_tru):
        real_comp = is_correct_scalar_sf(a_sub.real, a_tru.real, digits=digits)  # type: ignore
        imag_comp = is_correct_scalar_sf(a_sub.imag, a_tru.imag, digits=digits)  # type: ignore
        return real_comp and imag_comp

    # Get bounds on submitted answer
    if a_tru == 0:
        n = digits - 1
    elif np.abs(a_tru) == math.inf:
        return a_sub == a_tru
    elif np.isnan(a_tru):
        return np.isnan(a_sub)  # type: ignore
    else:
        n = -int(np.floor(np.log10(np.abs(a_tru)))) + (digits - 1)
    eps = 0.51 * (10**-n)
    lower_bound = a_tru - eps
    upper_bound = a_tru + eps

    # Check if submitted answer is in bounds
    return bool((a_sub > lower_bound) & (a_sub < upper_bound))


def check_answers_names(data: QuestionData, name: str) -> None:
    """Check that answers names are distinct using property in data dict."""
    if name in data["answers_names"]:
        raise KeyError(f'Duplicate "answers-name" attribute: "{name}"')
    data["answers_names"][name] = True


def grade_answer_parameterized(
    data: QuestionData,
    question_name: str,
    grade_function: Callable[[Any], tuple[bool | float, str | None]],
    weight: int = 1,
) -> None:
    """
    Grade question question_name. grade_function should take in a single parameter
    (which will be the submitted answer) and return a 2-tuple:
        - The first element of the 2-tuple should either be:
            - a boolean indicating whether the question should be marked correct
            - a partial score between 0 and 1, inclusive
        - The second element of the 2-tuple should either be:
            - a string containing feedback
            - None, if there is no feedback (usually this should only occur if the answer is correct)
    """
    # Create the data dictionary at first
    data["partial_scores"][question_name] = {"score": 0.0, "weight": weight}

    # If there is no submitted answer, we shouldn't do anything. Issues with blank
    # answers should be handled in parse.
    if question_name not in data["submitted_answers"]:
        return

    submitted_answer = data["submitted_answers"][question_name]

    # Run passed-in grading function
    result, feedback_content = grade_function(submitted_answer)

    # Try converting partial score
    if isinstance(result, bool):
        partial_score = 1.0 if result else 0.0
    elif isinstance(result, float | int):
        assert 0.0 <= result <= 1.0
        partial_score = result
    else:
        assert_never(result)

    # Set corresponding partial score and feedback
    data["partial_scores"][question_name]["score"] = partial_score

    if feedback_content:
        data["partial_scores"][question_name]["feedback"] = feedback_content


def determine_score_params(
    score: float,
) -> tuple[Literal["correct", "partial", "incorrect"], bool | float]:
    """
    Determine appropriate key and value for display on the frontend given the
    score for a particular question. For elements following PrairieLearn
    conventions, the return value can be used as a key/value pair in the
    dictionary passed to an element's Mustache template to display a score badge.
    """
    if score >= 1:
        return ("correct", True)
    elif score > 0:
        return ("partial", math.floor(score * 100))

    return ("incorrect", True)


def set_weighted_score_data(data: QuestionData, weight_default: int = 1) -> None:
    """
    Set overall question score to be weighted average of all partial scores. Use
    weight_default to fill in a default weight for a score if one is missing.
    """
    weight_total = 0
    score_total = 0.0
    for part in data["partial_scores"].values():
        score = part["score"]
        weight = part.get("weight", weight_default)

        if score is None:
            raise ValueError("Can't set weighted score data if score is None.")

        score_total += score * weight
        weight_total += weight

    data["score"] = score_total / weight_total


def set_all_or_nothing_score_data(data: QuestionData) -> None:
    """Give points to main question score if all partial scores are correct."""
    data["score"] = 1.0 if all_partial_scores_correct(data) else 0.0


def all_partial_scores_correct(data: QuestionData) -> bool:
    """Return true if all questions are correct in partial scores and it's nonempty."""
    partial_scores = data["partial_scores"]

    if len(partial_scores) == 0:
        return False

    return all(
        part["score"] is not None and math.isclose(part["score"], 1.0)
        for part in partial_scores.values()
    )


def is_int_json_serializable(n: int) -> bool:
    return -((2**53) - 1) <= n <= 2**53 - 1


def add_files_format_error(data: QuestionData, error: str) -> None:
    """Add a format error to the data dictionary."""
    if data["format_errors"].get("_files") is None:
        data["format_errors"]["_files"] = []
    if isinstance(data["format_errors"]["_files"], list):
        data["format_errors"]["_files"].append(error)
    else:
        data["format_errors"]["_files"] = [
            '"_files" was present in "format_errors" but was not an array',
            error,
        ]


def add_submitted_file(
    data: QuestionData,
    file_name: str,
    base64_contents: str,
) -> None:
    """Add a submitted file to the data dictionary."""
    if data["submitted_answers"].get("_files") is None:
        data["submitted_answers"]["_files"] = []
    if isinstance(data["submitted_answers"]["_files"], list):
        data["submitted_answers"]["_files"].append({
            "name": file_name,
            "contents": base64_contents,
        })
    else:
        add_files_format_error(
            data, '"_files" is present in "submitted_answers" but is not an array'
        )

"""Utilities for grading in PrairieLearn.

```python
from prairielearn import ...
```
"""

import math
from collections.abc import Callable
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
from numpy.typing import ArrayLike
from typing_extensions import assert_never

from prairielearn.question_utils import QuestionData


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_dd(*args: Any, **kwargs: Any) -> bool:  # noqa: D103, N802
    return is_correct_ndarray2d_dd(*args, **kwargs)


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_sf(*args: Any, **kwargs: Any) -> bool:  # noqa: D103, N802
    return is_correct_ndarray2d_sf(*args, **kwargs)


# This is a deprecated alias that will be removed in the future -- use the lowercase version instead.
def is_correct_ndarray2D_ra(*args: Any, **kwargs: Any) -> bool:  # noqa: D103, N802
    return is_correct_ndarray2d_ra(*args, **kwargs)


def is_correct_ndarray2d_dd(
    a_sub: npt.NDArray[Any], a_tru: npt.NDArray[Any], digits: int = 2
) -> bool:
    """Check if a submitted 2D numpy array is correct within a certain number of decimal digits after the decimal place.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
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
    """Check if a submitted 2D numpy array is correct within a certain number of significant figures.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
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
    """Check if a submitted 2D numpy array is correct within a relative and absolute tolerance.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
    # Check if each element is correct
    return np.allclose(a_sub, a_tru, rtol, atol)


def is_correct_scalar_ra(
    a_sub: ArrayLike, a_tru: ArrayLike, rtol: float = 1e-5, atol: float = 1e-8
) -> bool:
    """Compare a_sub and a_tru using relative tolerance rtol and absolute tolerance atol.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
    return bool(np.allclose(a_sub, a_tru, rtol, atol))


def is_correct_scalar_dd(a_sub: ArrayLike, a_tru: ArrayLike, digits: int = 2) -> bool:
    """Compare a_sub and a_tru using digits many digits after the decimal place.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
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
    """Compare a_sub and a_tru using digits many significant figures.

    Returns:
        `True` if they are equal, `False` otherwise.
    """
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
    """Check that answers names are distinct using property in data dict.

    Updates the data dictionary with the name if it is not already present.

    Raises:
        KeyError: If the name is already present in the data dictionary.
    """
    if name in data["answers_names"]:
        raise KeyError(f'Duplicate "answers-name" attribute: "{name}"')
    data["answers_names"][name] = True


def grade_answer_parameterized(
    data: QuestionData,
    name: str,
    grade_function: Callable[[Any], tuple[bool | float, str | None]],
    weight: int = 1,
) -> None:
    """
    Grade the answer for the input `name` using the provided `grade_function`.

    Updates the `data` dictionary with the partial score and feedback for the question.

    `grade_function` should take in a single parameter (which will be the submitted answer) and return a 2-tuple.

    The first element of the 2-tuple should either be:

    - a boolean indicating whether the question should be marked correct
    - a partial score between 0 and 1, inclusive

    The second element of the 2-tuple should either be:

    - a string containing feedback
    - `None`, if there is no feedback (usually this should only occur if the answer is correct)

    Examples:
        >>> def grading_function(submitted_answer):
        ...     if submitted_answer == "foo":
        ...         return True, None
        ...     elif submitted_answer == "bar":
        ...         return 0.5, "Almost there!"
        ...     return False, "Try again!"
        >>> data = {
        ...     "submitted_answers": {"my_string_input": "bar"},
        ...     "partial_scores": {},
        ...     "answers_names": {},
        ... }
        >>> grade_answer_parameterized(data, "my_string_input", grading_function, weight=2)
        >>> data["partial_scores"]
        {"my_string_input": {"score": 0.5, "weight": 2, "feedback": "Almost there!"}}
    """
    # Create the data dictionary at first
    data["partial_scores"][name] = {"score": 0.0, "weight": weight}

    # If there is no submitted answer, we shouldn't do anything. Issues with blank
    # answers should be handled in parse.
    if name not in data["submitted_answers"]:
        return

    submitted_answer = data["submitted_answers"][name]

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
    data["partial_scores"][name]["score"] = partial_score

    if feedback_content:
        data["partial_scores"][name]["feedback"] = feedback_content


def determine_score_params(
    score: float,
) -> tuple[Literal["correct", "partial", "incorrect"], bool | float]:
    """
    Determine appropriate key and value for display on the frontend given the
    score for a particular question. For elements following PrairieLearn
    conventions, the return value can be used as a key/value pair in the
    dictionary passed to an element's Mustache template to display a score badge.

    Returns:
        A tuple containing the key and value for the score badge.

    Examples:
        >>> determine_score_params(1)
        ("correct", True)
        >>> determine_score_params(0)
        ("incorrect", True)
        >>> determine_score_params(0.5)
        ("partial", 50)
    """
    if score >= 1:
        return ("correct", True)
    elif score > 0:
        return ("partial", math.floor(score * 100))

    return ("incorrect", True)

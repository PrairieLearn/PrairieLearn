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
from prairielearn.timeout_utils import ThreadingTimeout, TimeoutState


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
    timeout: float | None = None,
    timeout_format_error: str | None = None,
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

    Args:
        data: The question data dictionary.
        name: The name of the answer input field.
        grade_function: A function that takes the submitted answer and returns a 2-tuple of (score, feedback).
        weight: The weight of this answer in the overall question score.
        timeout: Optional timeout in seconds for executing the grade_function. If the function times out,
            a format error will be set instead of grading the answer.
        timeout_format_error: Optional custom error message to display when a timeout occurs. If not provided
            and timeout is set, a default message will be used.

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
        ...     "format_errors": {},
        ... }
        >>> grade_answer_parameterized(data, "my_string_input", grading_function, weight=2)
        >>> data["partial_scores"]
        {"my_string_input": {"score": 0.5, "weight": 2, "feedback": "Almost there!"}}

        >>> # Example with timeout
        >>> def slow_grading_function(submitted_answer):
        ...     import time
        ...     time.sleep(10)  # This will timeout
        ...     return True, None
        >>> data = {
        ...     "submitted_answers": {"my_input": "test"},
        ...     "partial_scores": {},
        ...     "answers_names": {},
        ...     "format_errors": {},
        ... }
        >>> grade_answer_parameterized(
        ...     data, "my_input", slow_grading_function, timeout=1.0,
        ...     timeout_format_error="Your answer took too long to grade."
        ... )
        >>> data["format_errors"]["my_input"]
        "Your answer took too long to grade."
    """
    # Create the data dictionary at first
    data["partial_scores"][name] = {"score": 0.0, "weight": weight}

    # If there is no submitted answer, we shouldn't do anything. Issues with blank
    # answers should be handled in parse.
    if name not in data["submitted_answers"]:
        return

    submitted_answer = data["submitted_answers"][name]

    # Execute the grading function, with optional timeout
    timed_out = False

    if timeout is not None:
        with ThreadingTimeout(timeout) as ctx:
            result, feedback_content = grade_function(submitted_answer)
        timed_out = ctx.state == TimeoutState.TIMED_OUT
    else:
        result, feedback_content = grade_function(submitted_answer)

    # Check if timeout occurred
    if timed_out:
        # Set format error instead of grading
        error_message = (
            timeout_format_error
            if timeout_format_error is not None
            else "Grading timed out - your answer may be too complex."
        )
        data["format_errors"][name] = error_message
        return

    # Try converting partial score
    # Note: result and feedback_content are always assigned in both branches above,
    # but the type checker doesn't understand this flow
    if isinstance(result, bool):  # type: ignore[possibly-unbound]
        partial_score = 1.0 if result else 0.0
    elif isinstance(result, float | int):  # type: ignore[possibly-unbound]
        assert 0.0 <= result <= 1.0
        partial_score = result
    else:
        assert_never(result)  # type: ignore[possibly-unbound]

    # Set corresponding partial score and feedback
    data["partial_scores"][name]["score"] = partial_score

    if feedback_content:  # type: ignore[possibly-unbound]
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

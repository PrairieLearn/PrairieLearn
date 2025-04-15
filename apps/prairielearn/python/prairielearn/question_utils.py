"""Utilities for dealing with questions.

```python
from prairielearn import ...
```
"""

import math
from typing import Any, Literal, TypedDict

from typing_extensions import NotRequired


class PartialScore(TypedDict):
    """A class with type signatures for the partial scores dict.

    For more information see the [element developer guide](../../devElements.md).
    """

    score: float | None
    weight: NotRequired[int]
    feedback: NotRequired[str | dict[str, str] | Any]


# TODO: This type definition should not yet be seen as authoritative, it may
# need to be modified as we expand type checking to cover more of the element code.
# The fields below containing 'Any' in the types are ones which are used
# in different ways by different question elements. Ideally we would have
# QuestionData be a generic type so that question elements could declare types
# for their answer data, feedback data, etc., but TypedDicts with Generics are
# not yet supported: https://bugs.python.org/issue44863
class QuestionData(TypedDict):
    """A class with type signatures for the data dictionary.

    For more information see the [element developer guide](../../devElements.md).
    """

    params: dict[str, Any]
    correct_answers: dict[str, Any]
    submitted_answers: dict[str, Any]
    format_errors: dict[str, Any]
    partial_scores: dict[str, PartialScore]
    score: float
    feedback: dict[str, Any]
    variant_seed: str
    options: dict[str, Any]
    raw_submitted_answers: dict[str, Any]
    editable: bool
    panel: Literal["question", "submission", "answer"]
    extensions: dict[str, Any]
    num_valid_submissions: int
    manual_grading: bool
    answers_names: dict[str, bool]


class ElementTestData(QuestionData):
    test_type: Literal["correct", "incorrect", "invalid"]


def set_weighted_score_data(data: QuestionData, weight_default: int = 1) -> None:
    """
    Set overall question score to be weighted average of all partial scores. Use
    weight_default to fill in a default weight for a score if one is missing.

    Raises:
        ValueError: If any of the partial scores have a score of None.

    Examples:
        >>> data = {
        ...     "partial_scores": {
        ...         "foo": {"score": 0.5, "weight": 1},
        ...         "bar": {"score": 0.8, "weight": 2}
        ...     }
        ... }
        >>> set_weighted_score_data(data)
        >>> data["score"]
        0.7
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
    """Give points to main question score if all partial scores are correct.

    Examples:
        >>> data = {"partial_scores": {"foo": {"score": 1.0}, "bar": {"score": 1.0}}}
        >>> set_all_or_nothing_score_data(data)
        >>> data["score"]
        1.0
        >>> data = {"partial_scores": {"foo": {"score": 1.0}, "bar": {"score": 0.5}}}
        >>> set_all_or_nothing_score_data(data)
        >>> data["score"]
        0.0
    """
    data["score"] = 1.0 if all_partial_scores_correct(data) else 0.0


def all_partial_scores_correct(data: QuestionData) -> bool:
    """Check if all partial scores are close to 1.

    Returns:
        `True` if all scores are close to 1 and not an empty list, `False` otherwise.

    Examples:
        >>> data = {"partial_scores": {"foo":{"score": 1.0}}}
        >>> all_partial_scores_correct(data)
        True
        >>> data = {"partial_scores": {"foo": {"score": 1.0}, "bar": {"score": 0.5}}}
        >>> all_partial_scores_correct(data)
        False
    """
    partial_scores = data["partial_scores"]

    if len(partial_scores) == 0:
        return False

    return all(
        part["score"] is not None and math.isclose(part["score"], 1.0)
        for part in partial_scores.values()
    )


def add_files_format_error(data: QuestionData, error: str) -> None:
    """Add a format error to the data dictionary.

    Examples:
        >>> add_files_format_error(data, f"Missing baz in foo.txt")
        >>> data["format_errors"]
        {"_files": ["Missing baz in foo.txt"]}
    """
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
    *,
    mimetype: str | None = None,
) -> None:
    """Add a submitted file to the data dictionary.

    Examples:
        >>> add_submitted_file(data, "foo.txt", "base64-contents", mimetype="text/plain")
        >>> data["submitted_answers"]
        {"_files": [{"name": "foo.txt", "contents": "base64-contents", "mimetype": "text/plain"}]}
    """
    if data["submitted_answers"].get("_files") is None:
        data["submitted_answers"]["_files"] = []
    if isinstance(data["submitted_answers"]["_files"], list):
        submitted_file = {"name": file_name, "contents": base64_contents}
        if mimetype is not None:
            submitted_file["mimetype"] = mimetype
        data["submitted_answers"]["_files"].append(submitted_file)
    else:
        add_files_format_error(
            data, '"_files" is present in "submitted_answers" but is not an array'
        )

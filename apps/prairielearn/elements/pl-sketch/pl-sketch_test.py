import json
import pathlib

import pytest
from grading.grade_modes import grade_submission

"""
Tests for the pl-sketch element's grading functions.

The data used to test the functions is stored in a JSON dictionary in an external file.
It is organized by drawing tool, and should be changed with caution as those changes will
affect several tests at once. The easiest way to generate additional test data is to run
the element, draw the intended input, and add the following code to the grade function
to save the data parameter (and then add it as a new dictionary key):
```
    file_path = "pl-sketch-test_data-temp.json"
    try:
        with open(file_path, 'w', encoding='utf-8') as json_file:
            json.dump(data, json_file, indent=4)
        print(f"Data successfully written to {file_path}")
    except IOError as e:
        print(f"Error writing to file: {e}")
```
"""

current_path = pathlib.Path(__file__).parent.resolve()
with open(f"{current_path}/pl-sketch-test_data.json") as file:
    test_data = json.load(file)

fd_data = test_data["free-draw-tool"]
pt_data = test_data["point-tool"]
# TODO: Polygon grading is slow, so consider using fewer test cases to not bloat the overall CI runtime
pg_data = test_data["polygon-tool"]
ln_data = test_data["line-tool"]
hl_data = test_data["horizontal-line-tool"]
vl_data = test_data["vertical-line-tool"]


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x", "y"),
    [
        (fd_data, "fd", 1, 0.25, 0),
        (fd_data, "fd", 1, None, 0),
        (fd_data, "fd", 1, 0.25, None),
        (fd_data, "fd", 0, 0.75, 0),
        (fd_data, "fd", 0, None, 3),
        (fd_data, "fd", 0, 0.7, None),
        (pt_data, "pt", 1, 0.5, 0),
        (pt_data, "pt", 1, 0.5, None),
        (pt_data, "pt", 1, None, 1),
        (pt_data, "pt", 0, 1, 0),
        (pt_data, "pt", 0, 1, None),
        (pt_data, "pt", 0, None, 0.5),
        (pg_data, "pg", 1, 1, -0.5),
        (pg_data, "pg", 1, None, 0.5),
        (pg_data, "pg", 1, 1, None),
        (pg_data, "pg", 0, 1, 1),
        (pg_data, "pg", 0, 3, None),
        (pg_data, "pg", 0, None, 2),
        (ln_data, "line", 1, 0.25, 0),
        (ln_data, "line", 1, None, 0),
        (ln_data, "line", 1, 0.25, None),
        (ln_data, "line", 0, 0.75, 0),
        (ln_data, "line", 0, None, 2),
        (ln_data, "line", 0, 4, None),
        (hl_data, "hl", 1, None, 1),
        (hl_data, "hl", 1, None, 0),
        (hl_data, "hl", 0, None, 2),
        (vl_data, "vl", 1, 2, None),
        (vl_data, "vl", 1, 4, None),
        (vl_data, "vl", 0, 3, None),
    ],
)
def test_match(
    data: dict, toolid: str, correct: int, x: float | None, y: float | None
) -> None:
    grader = {
        "type": "match",
        "toolid": toolid,
        "x": x,
        "y": y,
        "tolerance": 15,
        "pt_tolerance": 10,  # 1/2 * point diameter + 3
        "endpoint": None,
        "weight": 1,
        "stage": -1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "fun", "x1", "x2"),
    [
        (fd_data, "fd", 1, "x", 1, 1.5),
        (pt_data, "pt", 1, "x", 2, 4),
        (pt_data, "pt", 0, "-x + 6", 2, 4),
    ],
)
def test_match_fun(
    data: str, toolid: str, correct: int, fun: str, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "match-fun",
        "toolid": toolid,
        "fun": fun,
        "funxyswap": None,
        "allowundefined": True,
        "x1": x1,
        "x2": x2,
        "stage": -1,
        "tolerance": 10,
        "pt_tolerance": 10,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "count", "mode", "x1", "x2"),
    [
        (fd_data, "fd", 1, 2, "exact", 2.5, 3.5),
        (fd_data, "fd", 1, 2, "at-most", 2.5, 3.5),
        (fd_data, "fd", 1, 1, "at-least", 2.5, 3.5),
        (fd_data, "fd", 0, 1, "exact", 2.5, 3.5),
        (
            fd_data,
            "fd",
            0,
            5,
            "at-least",
            2.5,
            3.5,
        ),  # note that tolerances will consider count=4 correct for this
        (fd_data, "fd", 0, 1, "at-most", 2.5, 3.5),
        (pt_data, "pt", 1, 5, "exact", 2, 4),
        (pt_data, "pt", 1, 3, "at-least", 2, 4),
        (pt_data, "pt", 1, 6, "at-most", 2, 4),
        (pt_data, "pt", 0, 2, "exact", 2, 4),
        (pt_data, "pt", 0, 6, "at-least", 2, 4),
        (pt_data, "pt", 0, 2, "at-most", 2, 4),
        (pg_data, "pg", 1, 4, "exact", None, None),
        (pg_data, "pg", 1, 1, "at-least", 2, 4),
        (pg_data, "pg", 1, 2, "at-most", None, 4),
        (pg_data, "pg", 0, 3, "exact", 0, 4),
        (pg_data, "pg", 0, 2, "at-least", 6, 8),
        (pg_data, "pg", 0, 2, "at-most", 2, 8),
        (ln_data, "line", 1, 3, "exact", 2, 3.5),
        (ln_data, "line", 1, 3, "at-most", 2, 3.5),
        (ln_data, "line", 1, 2, "at-least", 2.5, 3.5),
        (ln_data, "line", 0, 2, "exact", 1.25, 1.75),
        (
            ln_data,
            "line",
            0,
            5,
            "at-least",
            2.5,
            3.5,
        ),  # note that tolerances will consider count=4 correct for this
        (ln_data, "line", 0, 2, "at-most", 2, 4),
        (hl_data, "hl", 1, 2, "exact", 2, 4),
        (hl_data, "hl", 1, 1, "at-least", None, None),
        (hl_data, "hl", 1, 3, "at-most", None, None),
        (hl_data, "hl", 0, 1, "exact", None, None),
        (hl_data, "hl", 0, 3, "at-least", 1, 4),
        (hl_data, "hl", 0, 1, "at-most", None, None),
        (vl_data, "vl", 1, 2, "exact", 2, 4),
        (vl_data, "vl", 1, 1, "at-least", None, None),
        (vl_data, "vl", 1, 3, "at-most", None, None),
        (vl_data, "vl", 0, 1, "exact", None, None),
        (vl_data, "vl", 0, 3, "at-least", 1, 4),
        (vl_data, "vl", 0, 1, "at-most", None, None),
    ],
)
def test_count(
    data: str,
    toolid: str,
    correct: int,
    count: int,
    mode: str,
    x1: float | None,
    x2: float | None,
) -> None:
    grader = {
        "type": "count",
        "toolid": toolid,
        "count": count,
        "mode": mode,
        "x1": x1,
        "x2": x2,
        "tolerance": 15,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 3.5, 4),
        (fd_data, "fd", 0, 4, 4.5),
        (fd_data, "fd", 0, 4.5, 5),
        (ln_data, "line", 1, 3, 3.5),
        (ln_data, "line", 0, 2, 2.5),
        (ln_data, "line", 0, 3.5, 4),
    ],
)
def test_monot_increasing(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "monot-increasing",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 2,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 4.5, 5),
        (fd_data, "fd", 0, 3.5, 4),
        (fd_data, "fd", 0, 5, 5.5),
        (ln_data, "line", 1, 2, 2.5),
        (ln_data, "line", 0, 3, 3.5),
        (ln_data, "line", 0, 1.5, 2),
    ],
)
def test_monot_decreasing(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "monot-decreasing",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 2,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 3.5, 4),
        (fd_data, "fd", 0, 4.5, 5),
        (fd_data, "fd", 0, 5, 5.5),
        (ln_data, "line", 0, None, None),
        # could test polyline to make sure it is incorrect, as is done with line.
        # however, other than concave-up and concave-down, polyline has the same
        # behavior as free-draw-tool
    ],
)
def test_concave_up(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "concave-up",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 7,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 4.5, 5),
        (fd_data, "fd", 0, 3.5, 4),
        (fd_data, "fd", 0, 4, 4.5),
        (ln_data, "line", 0, None, None),
    ],
)
def test_concave_down(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "concave-down",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 7,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 2, 3),
        (fd_data, "fd", 0, 1, 2),
        (pg_data, "pg", 1, 3.5, 5),
        (pg_data, "pg", 0, 2, 4),
        (pg_data, "pg", 0, 9, 10),
        (ln_data, "line", 1, 2, 3),
        (ln_data, "line", 0, 1, 2),
        (hl_data, "hl", 1, 2, 3),
        (hl_data, "hl", 1, None, None),
    ],
)
def test_defined_in(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "defined-in",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 20,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, "fd", 1, 1.5, 2),
        (fd_data, "fd", 1, 2.5, 2.5),
        (fd_data, "fd", 0, 2, 2.5),
        (fd_data, "fd", 0, 0.25, 0.25),
        (pt_data, "pt", 1, 1, 1.5),
        (pt_data, "pt", 1, 4.5, 4.5),
        (pt_data, "pt", 0, 5, 6),
        (pg_data, "pg", 1, 2.5, 3),  # fix range definer
        (pg_data, "pg", 1, 8, 10),
        (pg_data, "pg", 1, 6, 6),
        (pg_data, "pg", 0, 0, 2),
        (pg_data, "pg", 0, 3, 3.5),
        (pg_data, "pg", 0, 1, 1),
        (ln_data, "line", 1, 1.5, 2),
        (ln_data, "line", 1, 0.5, 0.5),
        (ln_data, "line", 0, 2, 2.5),
        (ln_data, "line", 0, 0.25, 0.25),
        (hl_data, "hl", 0, 2, 3),
        (hl_data, "hl", 0, None, None),
        (hl_data, "hl", 0, 1, 1),
        (vl_data, "vl", 1, 1, 2),
        (vl_data, "vl", 1, 2, 2),
        (vl_data, "vl", 0, 1, 5),
    ],
)
def test_undefined_in(
    data: str, toolid: str, correct: int, x1: float | None, x2: float | None
) -> None:
    grader = {
        "type": "undefined-in",
        "toolid": toolid,
        "x1": x1,
        "x2": x2,
        "tolerance": 10,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2", "y", "fun"),
    [
        (fd_data, "fd", 1, 4.5, 5, 0, None),
        (fd_data, "fd", 0, 5, 5.5, 0, None),
        (fd_data, "fd", 0, 3.5, 4, 0, None),
        (fd_data, "fd", 1, 1, 1.5, None, "x + 1"),
        (fd_data, "fd", 0, 1, 1.5, None, "x - 1"),
        (fd_data, "fd", 0, 1.5, 2, None, "x"),
        (pt_data, "pt", 1, 5, 6, 2, None),
        (pt_data, "pt", 0, 2, 4, 2, None),
        (pt_data, "pt", 0, 0, 2, 1, None),
        (pt_data, "pt", 1, 2, 4, None, "x+1"),
        (pt_data, "pt", 0, 2, 4, None, "x-1"),
        (pg_data, "pg", 1, 0, 2, 2, None),
        (pg_data, "pg", 1, 3.5, 4, -2, None),
        (pg_data, "pg", 0, 0, 2, -2, None),
        (pg_data, "pg", 0, 2.5, 3, -2, None),
        (pg_data, "pg", 1, 0, 2, None, "x + 1"),
        (pg_data, "pg", 0, 2.5, 3, None, "x - 1"),
        (pg_data, "pg", 0, 0, 2, None, "x - 1"),
        (ln_data, "line", 1, 0, 0.5, 2, None),
        (ln_data, "line", 0, None, None, 0, None),
        (ln_data, "line", 1, 1, 1.5, None, "x + 1"),
        (ln_data, "line", 0, 1, 1.5, None, "x - 1"),
        (ln_data, "line", 0, 1.5, 2, None, "x"),
        (hl_data, "hl", 1, None, None, 2, None),
        (hl_data, "hl", 0, None, None, 0.5, None),
        (hl_data, "hl", 0, None, None, -1, None),
        (hl_data, "hl", 0, 1, 2, None, "-x**2 - 1"),
        (hl_data, "hl", 1, None, None, None, "x**2 + 2"),
    ],
)
def test_less_than(
    data: str,
    toolid: str,
    correct: int,
    x1: float | None,
    x2: float | None,
    y: float | None,
    fun: str | None,
) -> None:
    grader = {
        "type": "less-than",
        "toolid": toolid,
        "y": y,
        "fun": fun,
        "funxyswap": None,
        "x1": x1,
        "x2": x2,
        "tolerance": 15,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2", "y", "fun"),
    [
        (fd_data, "fd", 1, 3.5, 4, 0, None),
        (fd_data, "fd", 0, 4, 4.5, 0, None),
        (fd_data, "fd", 0, 4.5, 5, 0, None),
        (fd_data, "fd", 1, 1, 1.5, None, "x - 1"),
        (fd_data, "fd", 0, 1, 1.5, None, "x + 1"),
        (fd_data, "fd", 0, 1.5, 2, None, "x"),
        (pt_data, "pt", 1, 2, 4, 2, None),
        (pt_data, "pt", 0, 5, 6, 2, None),
        (pt_data, "pt", 0, 0, 2, 1, None),
        (pt_data, "pt", 1, 2, 4, None, "x-1"),
        (pt_data, "pt", 0, 2, 4, None, "x+1"),
        (pg_data, "pg", 1, 6, 8, -2, None),
        (pg_data, "pg", 0, 0, 2, -2, None),
        (pg_data, "pg", 1, 6, 8, None, "-x-1"),
        (pg_data, "pg", 0, 4, 4.5, None, "x-2"),
        (pg_data, "pg", 0, 3, 4, None, "0.5*x"),
        (ln_data, "line", 1, 2, 4, 0, None),
        (ln_data, "line", 0, 0, 1, 0, None),
        (
            ln_data,
            "line",
            1,
            1,
            1.5,
            None,
            "x - 1",
        ),
        (ln_data, "line", 0, 1, 1.5, None, "x + 1"),
        (ln_data, "line", 0, 1.5, 2, None, "x"),
        (hl_data, "hl", 1, None, None, -1, None),
        (hl_data, "hl", 0, None, None, 2, None),
        (hl_data, "hl", 0, None, None, 0.5, None),
        (
            hl_data,
            "hl",
            1,
            1,
            2,
            None,
            "-x**2 - 1",
        ),
        (hl_data, "hl", 0, None, None, None, "x**2 + 2"),
    ],
)
def test_greater_than(
    data: str,
    toolid: str,
    correct: int,
    x1: float | None,
    x2: float | None,
    y: float | None,
    fun: str | None,
) -> None:
    grader = {
        "type": "greater-than",
        "toolid": toolid,
        "y": y,
        "fun": fun,
        "funxyswap": None,
        "x1": x1,
        "x2": x2,
        "tolerance": 15,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "length"),
    [
        (ln_data, "line-v", 1, 2),
        (ln_data, "line-v", 0, 1),
    ],
)
def test_match_length(
    data: str, toolid: str, correct: int, length: float | None
) -> None:
    grader = {
        "type": "match-length",
        "toolid": toolid,
        "length": length,
        "tolerance": 15,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "angle", "allow_flip"),
    [
        (ln_data, "line-v", 1, 180, False),
        (ln_data, "line-v", 1, 0, True),
        (ln_data, "line-v", 0, 0, False),
        (ln_data, "line-v", 0, 90, False),
    ],
)
def test_match_angle(
    data: str, toolid: str, correct: int, angle: float | None, allow_flip: bool | None
) -> None:
    grader = {
        "type": "match-angle",
        "toolid": toolid,
        "angle": angle,
        "allowflip": allow_flip,
        "tolerance": 15,
        "stage": -1,
        "weight": 1,
        "feedback": "None",
        "debug": False,
    }
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct

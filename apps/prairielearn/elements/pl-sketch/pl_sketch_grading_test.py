import json
import pathlib

import pytest
from pl_sketch_grading import grade_submission
from prairielearn import QuestionData
from sketchresponse.types import SketchGrader, SketchTool

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

# Dummy tool and grader data as template with default settings and all optional fields set to None
dummy_tool: SketchTool = {
    "id": "",
    "group": None,
    "name": "",
    "color": "black",
    "label": "Tool",
    "limit": None,
    "helper": False,
    "readonly": False,
    "dashStyle": None,
    "directionConstraint": None,
    "lengthConstraint": None,
    "size": None,
    "hollow": None,
    "opacity": None,
    "closed": None,
    "fillColor": None,
    "arrowHead": None,
}

default_grader: SketchGrader = {
    "type": "",
    "toolid": [],
    "x": None,
    "y": None,
    "tolerance": 0,
    "weight": 1,
    "stage": 0,
    "debug": False,
    "feedback": None,
    "endpoint": None,
    "xrange": None,
    "yrange": None,
    "count": None,
    "fun": None,
    "xyflip": None,
    "mode": None,
    "allowundefined": None,
}

fd_tool = dummy_tool.copy()
fd_tool["id"] = "fd"
fd_tool["name"] = "freeform"
fd_data: QuestionData = test_data["free-draw-tool"]

pt_tool = dummy_tool.copy()
pt_tool["id"] = "pt"
pt_tool["name"] = "point"
pt_data: QuestionData = test_data["point-tool"]

# TODO: Polygon grading is slow, so consider using fewer test cases to not bloat the overall CI runtime
pg_tool = dummy_tool.copy()
pg_tool["id"] = "pg"
pg_tool["name"] = "polyline"
pg_tool["closed"] = True
pg_data: QuestionData = test_data["polygon-tool"]

ln_tool = dummy_tool.copy()
ln_tool["id"] = "line"
ln_tool["name"] = "line-segment"
ln_data: QuestionData = test_data["line-tool"]

hl_tool = dummy_tool.copy()
hl_tool["id"] = "hl"
hl_tool["name"] = "horizontal-line"
hl_data: QuestionData = test_data["horizontal-line-tool"]

vl_tool = dummy_tool.copy()
vl_tool["id"] = "vl"
vl_tool["name"] = "vertical-line"
vl_data: QuestionData = test_data["vertical-line-tool"]


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x", "y"),
    [
        (fd_data, fd_tool, 1, 0.25, 0),
        (fd_data, fd_tool, 1, None, 0),
        (fd_data, fd_tool, 1, 0.25, None),
        (fd_data, fd_tool, 0, 0.75, 0),
        (fd_data, fd_tool, 0, None, 3),
        (fd_data, fd_tool, 0, 0.7, None),
        (pt_data, pt_tool, 1, 0.5, 0),
        (pt_data, pt_tool, 1, 0.5, None),
        (pt_data, pt_tool, 1, None, 1),
        (pt_data, pt_tool, 0, 1, 0),
        (pt_data, pt_tool, 0, 1, None),
        (pt_data, pt_tool, 0, None, 0.5),
        (pg_data, pg_tool, 1, 1, -0.5),
        (pg_data, pg_tool, 1, None, 0.5),
        (pg_data, pg_tool, 1, 1, None),
        (pg_data, pg_tool, 0, 1, 1),
        (pg_data, pg_tool, 0, 3, None),
        (pg_data, pg_tool, 0, None, 2),
        (ln_data, ln_tool, 1, 0.25, 0),
        (ln_data, ln_tool, 1, None, 0),
        (ln_data, ln_tool, 1, 0.25, None),
        (ln_data, ln_tool, 0, 0.75, 0),
        (ln_data, ln_tool, 0, None, 2),
        (ln_data, ln_tool, 0, 4, None),
        (hl_data, hl_tool, 1, None, 1),
        (hl_data, hl_tool, 1, None, 0),
        (hl_data, hl_tool, 0, None, 2),
        (vl_data, vl_tool, 1, 2, None),
        (vl_data, vl_tool, 1, 4, None),
        (vl_data, vl_tool, 0, 3, None),
    ],
)
def test_match(
    data: QuestionData,
    toolid: SketchTool,
    correct: int,
    x: float | None,
    y: float | None,
) -> None:
    grader = default_grader.copy()
    grader["type"] = "match"
    grader["toolid"] = [toolid]
    grader["x"] = x
    grader["y"] = y
    grader["tolerance"] = 15
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "fun", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, "x", 1, 1.5),
        (pt_data, pt_tool, 1, "x", 2, 4),
        (pt_data, pt_tool, 0, "-x + 6", 2, 4),
    ],
)
def test_match_fun(
    data: QuestionData,
    toolid: SketchTool,
    correct: int,
    fun: str,
    x1: float,
    x2: float,
) -> None:
    grader = default_grader.copy()
    grader["type"] = "match-fun"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["fun"] = fun
    grader["allowundefined"] = True
    grader["tolerance"] = 10
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "count", "mode", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 2, "exact", 2.5, 3.5),
        (fd_data, fd_tool, 1, 2, "at-most", 2.5, 3.5),
        (fd_data, fd_tool, 1, 1, "at-least", 2.5, 3.5),
        (fd_data, fd_tool, 0, 1, "exact", 2.5, 3.5),
        (fd_data, fd_tool, 0, 5, "at-least", 2.5, 3.5),
        (fd_data, fd_tool, 0, 1, "at-most", 2.5, 3.5),
        (pt_data, pt_tool, 1, 5, "exact", 2, 4),
        (pt_data, pt_tool, 1, 3, "at-least", 2, 4),
        (pt_data, pt_tool, 1, 6, "at-most", 2, 4),
        (pt_data, pt_tool, 0, 2, "exact", 2, 4),
        (pt_data, pt_tool, 0, 6, "at-least", 2, 4),
        (pt_data, pt_tool, 0, 2, "at-most", 2, 4),
        (pg_data, pg_tool, 1, 4, "exact", 0, 10),
        (pg_data, pg_tool, 1, 1, "at-least", 2, 4),
        (pg_data, pg_tool, 1, 2, "at-most", 0, 4),
        (pg_data, pg_tool, 0, 3, "exact", 0, 4),
        (pg_data, pg_tool, 0, 2, "at-least", 6, 8),
        (pg_data, pg_tool, 0, 2, "at-most", 2, 8),
        (ln_data, ln_tool, 1, 3, "exact", 2, 3.5),
        (ln_data, ln_tool, 1, 3, "at-most", 2, 3.5),
        (ln_data, ln_tool, 1, 2, "at-least", 2.5, 3.5),
        (ln_data, ln_tool, 0, 2, "exact", 1.25, 1.75),
        (ln_data, ln_tool, 0, 5, "at-least", 2.5, 3.5),
        (ln_data, ln_tool, 0, 2, "at-most", 2, 4),
        (hl_data, hl_tool, 1, 2, "exact", 2, 4),
        (hl_data, hl_tool, 1, 1, "at-least", 0, 10),
        (hl_data, hl_tool, 1, 3, "at-most", 0, 10),
        (hl_data, hl_tool, 0, 1, "exact", 0, 10),
        (hl_data, hl_tool, 0, 3, "at-least", 1, 4),
        (hl_data, hl_tool, 0, 1, "at-most", 0, 10),
        (vl_data, vl_tool, 1, 2, "exact", 2, 4),
        (vl_data, vl_tool, 1, 1, "at-least", 0, 10),
        (vl_data, vl_tool, 1, 3, "at-most", 0, 10),
        (vl_data, vl_tool, 0, 1, "exact", 0, 10),
        (vl_data, vl_tool, 0, 3, "at-least", 1, 4),
        (vl_data, vl_tool, 0, 1, "at-most", 0, 10),
    ],
)
def test_count(
    data: QuestionData,
    toolid: SketchTool,
    correct: int,
    count: int,
    mode: str,
    x1: float,
    x2: float,
) -> None:
    grader = default_grader.copy()
    grader["type"] = "count"
    grader["toolid"] = [toolid]
    grader["mode"] = mode
    grader["count"] = count
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 15
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 3.5, 4),
        (fd_data, fd_tool, 1, 4, 4.5),
        (fd_data, fd_tool, 0, 4.5, 5),
        (ln_data, ln_tool, 0, 2, 2.5),
        (ln_data, ln_tool, 1, 3, 3.5),
        (ln_data, ln_tool, 1, 3.5, 4),
    ],
)
def test_monot_increasing(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "monot-increasing"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 2
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 0, 3.5, 4),
        (fd_data, fd_tool, 1, 4.5, 5),
        (fd_data, fd_tool, 1, 5, 5.5),
        (ln_data, ln_tool, 1, 1.5, 2),
        (ln_data, ln_tool, 1, 2, 2.5),
        (ln_data, ln_tool, 0, 3, 3.5),
    ],
)
def test_monot_decreasing(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "monot-decreasing"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 2
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 3.5, 4),
        (fd_data, fd_tool, 0, 4.5, 5),
        (fd_data, fd_tool, 0, 5, 5.5),
        (ln_data, ln_tool, 0, 0, 10),
        # could test polyline to make sure it is incorrect, as is done with line.
        # however, other than concave-up and concave-down, polyline has the same
        # behavior as free-draw-tool
    ],
)
def test_concave_up(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "concave-up"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 7
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 4.5, 5),
        (fd_data, fd_tool, 0, 3.5, 4),
        (fd_data, fd_tool, 0, 4, 4.5),
        (ln_data, ln_tool, 0, 0, 10),
    ],
)
def test_concave_down(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "concave-down"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 7
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 2, 3),
        (fd_data, fd_tool, 0, 1, 2),
        (pg_data, pg_tool, 1, 3.5, 5),
        (pg_data, pg_tool, 0, 2, 4),
        (pg_data, pg_tool, 0, 9, 10),
        (ln_data, ln_tool, 1, 2, 3),
        (ln_data, ln_tool, 0, 1, 2),
        (hl_data, hl_tool, 1, 2, 3),
        (hl_data, hl_tool, 1, 0, 10),
    ],
)
def test_defined_in(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "defined-in"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 20
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2"),
    [
        (fd_data, fd_tool, 1, 1.5, 2),
        (fd_data, fd_tool, 1, 2.5, 2.5),
        (fd_data, fd_tool, 0, 2, 2.5),
        (fd_data, fd_tool, 1, 0.25, 0.25),
        (pt_data, pt_tool, 1, 1, 1.5),
        (pt_data, pt_tool, 1, 4.5, 4.5),
        (pt_data, pt_tool, 0, 5, 6),
        (pg_data, pg_tool, 1, 2.5, 3),
        (pg_data, pg_tool, 1, 8, 10),
        (pg_data, pg_tool, 1, 6, 6),
        (pg_data, pg_tool, 0, 0, 2),
        (pg_data, pg_tool, 0, 3, 3.5),
        (pg_data, pg_tool, 1, 1, 1),
        (ln_data, ln_tool, 1, 1.5, 2),
        (ln_data, ln_tool, 1, 0.5, 0.5),
        (ln_data, ln_tool, 0, 2, 2.5),
        (ln_data, ln_tool, 1, 0.25, 0.25),
        (hl_data, hl_tool, 0, 2, 3),
        (hl_data, hl_tool, 0, 0, 10),
        (hl_data, hl_tool, 1, 1, 1),
        (vl_data, vl_tool, 1, 1, 2),
        (vl_data, vl_tool, 1, 2, 2),
        (vl_data, vl_tool, 1, 1, 5),
    ],
)
def test_undefined_in(
    data: QuestionData, toolid: SketchTool, correct: int, x1: float, x2: float
) -> None:
    grader = default_grader.copy()
    grader["type"] = "undefined-in"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["tolerance"] = 10
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2", "y", "fun"),
    [
        (fd_data, fd_tool, 0, 3.5, 4, 0, None),
        (fd_data, fd_tool, 1, 4.5, 5, 0, None),
        (fd_data, fd_tool, 1, 5, 5.5, 0, None),
        (fd_data, fd_tool, 1, 1, 1.5, None, "x + 1"),
        (fd_data, fd_tool, 0, 1, 1.5, None, "x - 1"),
        (fd_data, fd_tool, 1, 1.5, 2, None, "x"),
        (pt_data, pt_tool, 1, 5, 6, 2, None),
        (pt_data, pt_tool, 0, 2, 4, 2, None),
        (pt_data, pt_tool, 0, 0, 2, 1, None),
        (pt_data, pt_tool, 1, 2, 4, None, "x+1"),
        (pt_data, pt_tool, 0, 2, 4, None, "x-1"),
        (pg_data, pg_tool, 1, 0, 2, 2, None),
        (pg_data, pg_tool, 1, 3.5, 4, -2, None),
        (pg_data, pg_tool, 0, 0, 2, -2, None),
        (pg_data, pg_tool, 1, 0, 2, None, "x + 1"),
        (pg_data, pg_tool, 0, 0, 2, None, "x - 1"),
        (ln_data, ln_tool, 1, 0, 0.5, 2, None),
        (ln_data, ln_tool, 0, 0, 10, 0, None),
        (ln_data, ln_tool, 1, 1, 1.5, None, "x + 1"),
        (ln_data, ln_tool, 0, 1, 1.5, None, "x - 1"),
        (ln_data, ln_tool, 1, 1.5, 2, None, "x"),
        (hl_data, hl_tool, 1, 0, 10, 2, None),
        (hl_data, hl_tool, 0, 0, 10, 0.5, None),
        (hl_data, hl_tool, 0, 0, 10, -1, None),
        (hl_data, hl_tool, 0, 1, 2, None, "-x**2 - 1"),
        (hl_data, hl_tool, 1, 0, 10, None, "x**2 + 2"),
    ],
)
def test_less_than(
    data: QuestionData,
    toolid: SketchTool,
    correct: int,
    x1: float,
    x2: float,
    y: float | None,
    fun: str | None,
) -> None:
    grader = default_grader.copy()
    grader["type"] = "less-than"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["fun"] = fun
    grader["y"] = y
    grader["tolerance"] = 15
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct


@pytest.mark.parametrize(
    ("data", "toolid", "correct", "x1", "x2", "y", "fun"),
    [
        (fd_data, fd_tool, 1, 3.5, 4, 0, None),
        (fd_data, fd_tool, 0, 4, 4.5, 0, None),
        (fd_data, fd_tool, 0, 4.5, 5, 0, None),
        (fd_data, fd_tool, 1, 1, 1.5, None, "x - 1"),
        (fd_data, fd_tool, 0, 1, 1.5, None, "x + 1"),
        (fd_data, fd_tool, 1, 1.5, 2, None, "x"),
        (pt_data, pt_tool, 1, 2, 4, 2, None),
        (pt_data, pt_tool, 0, 5, 6, 2, None),
        (pt_data, pt_tool, 0, 0, 2, 1, None),
        (pt_data, pt_tool, 1, 2, 4, None, "x-1"),
        (pt_data, pt_tool, 0, 2, 4, None, "x+1"),
        (pg_data, pg_tool, 1, 6, 8, -2, None),
        (pg_data, pg_tool, 0, 0, 2, -2, None),
        (pg_data, pg_tool, 1, 6, 8, None, "-x-1"),
        (pg_data, pg_tool, 0, 4, 4.5, None, "x-2"),
        (pg_data, pg_tool, 0, 3, 4, None, "0.5*x"),
        (ln_data, ln_tool, 1, 2, 4, 0, None),
        (ln_data, ln_tool, 0, 0, 1, 0, None),
        (ln_data, ln_tool, 1, 1, 1.5, None, "x - 1"),
        (ln_data, ln_tool, 0, 1, 1.5, None, "x + 1"),
        (ln_data, ln_tool, 1, 1.5, 2, None, "x"),
        (hl_data, hl_tool, 1, 0, 10, -1, None),
        (hl_data, hl_tool, 0, 0, 10, 2, None),
        (hl_data, hl_tool, 0, 0, 10, 0.5, None),
        (hl_data, hl_tool, 1, 1, 2, None, "-x**2 - 1"),
        (hl_data, hl_tool, 0, 0, 10, None, "x**2 + 2"),
    ],
)
def test_greater_than(
    data: QuestionData,
    toolid: SketchTool,
    correct: int,
    x1: float,
    x2: float,
    y: float | None,
    fun: str | None,
) -> None:
    grader = default_grader.copy()
    grader["type"] = "greater-than"
    grader["toolid"] = [toolid]
    grader["xrange"] = [x1, x2]
    grader["fun"] = fun
    grader["y"] = y
    grader["tolerance"] = 15
    score, _, _ = grade_submission(grader, data, "test")
    assert score == correct

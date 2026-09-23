import base64
import importlib
import json
from typing import Any

pl_sketch = importlib.import_module("pl-sketch")


def _make_question_data() -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "feedback": {},
        "raw_submitted_answers": {},
        "options": {"question_path": "."},
        "answers_names": {},
    }


def test_correct_free_draw_function_solution_receives_full_credit() -> None:
    element_html = """
        <pl-sketch answers-name="graph" x-range="-1,3.25" y-range="-1,9.25" width="450" height="400">
            <pl-sketch-tool id="parabola" type="free-draw"></pl-sketch-tool>
            <pl-sketch-grade
                type="match-function"
                tool-id="parabola"
                function="4*x**2"
                allow-undefined="true"
                tolerance="20"
            ></pl-sketch-grade>
            <pl-sketch-solution
                tool-id="parabola"
                function="4*x**2"
            ></pl-sketch-solution>
        </pl-sketch>
    """
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    data["test_type"] = "correct"

    pl_sketch.test(element_html, data)

    assert data["partial_scores"]["graph"]["score"] == 1


def test_free_draw_coordinate_solution_preserves_disconnected_curves() -> None:
    element_html = """
        <pl-sketch answers-name="graph" x-range="-5,5" y-range="-5,5" width="400" height="400">
            <pl-sketch-tool id="curves" type="free-draw"></pl-sketch-tool>
            <pl-sketch-grade type="count" tool-id="curves" count="2"></pl-sketch-grade>
            <pl-sketch-solution
                tool-id="curves"
                coordinates="(-4,-3),(-3,-1),(-2,2),(-1,4)"
            ></pl-sketch-solution>
            <pl-sketch-solution
                tool-id="curves"
                coordinates="(1,4),(2,2),(3,-1),(4,-3)"
            ></pl-sketch-solution>
        </pl-sketch>
    """
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    solution_curves = data["params"]["graph"]["solution_state"]["curves"]
    expected_gradeable = [
        {"spline": [[point["x"], point["y"]] for point in curve]}
        for curve in solution_curves
    ]
    data["test_type"] = "correct"

    pl_sketch.test(element_html, data)

    raw_submission = data["raw_submitted_answers"]["graph-sketchresponse-submission"]
    submission = json.loads(base64.b64decode(raw_submission).decode("utf-8"))
    assert submission["gradeable"]["curves"] == expected_gradeable

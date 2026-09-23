import importlib
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

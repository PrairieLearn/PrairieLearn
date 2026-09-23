import base64
import importlib
import json
from pathlib import Path
from typing import Any, Literal

import lxml.html
import pytest

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
        "panel": "submission",
        "editable": False,
        "correct_answer_shown": False,
    }


@pytest.mark.parametrize(
    ("test_type", "expected_score"),
    [
        ("correct", 1),
        ("incorrect", 0),
    ],
)
def test_generated_submission_can_be_parsed_graded_and_rendered(
    test_type: Literal["correct", "incorrect"],
    expected_score: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
        <pl-sketch answers-name="graph" width="400" height="400">
            <pl-sketch-tool id="point" type="point"></pl-sketch-tool>
            <pl-sketch-grade
                type="match"
                tool-id="point"
                x="0"
                y="0"
            ></pl-sketch-grade>
            <pl-sketch-solution
                tool-id="point"
                coordinates="(0, 0)"
            ></pl-sketch-solution>
        </pl-sketch>
    """
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    data["test_type"] = test_type

    pl_sketch.test(element_html, data)
    data["submitted_answers"] = data["raw_submitted_answers"].copy()
    pl_sketch.parse(element_html, data)
    pl_sketch.grade(element_html, data)
    rendered_html = pl_sketch.render(element_html, data)

    assert "graph" not in data["format_errors"]
    assert data["partial_scores"]["graph"]["score"] == expected_score

    raw_submission = data["raw_submitted_answers"]["graph-sketchresponse-submission"]
    submission = json.loads(base64.b64decode(raw_submission).decode("utf-8"))
    rendered = lxml.html.fragment_fromstring(rendered_html, create_parent=True)
    encoded_config = rendered.xpath('.//div[contains(@id, "-sketchresponse-data")]')[
        0
    ].text
    config = json.loads(base64.b64decode(encoded_config).decode("utf-8"))

    assert config["initialstate"] == submission["data"]
    point = submission["data"]["point"][0]
    assert submission["gradeable"]["point"] == [{"point": [point["x"], point["y"]]}]

import base64
import copy
import importlib
import json
from pathlib import Path
from typing import Any, Literal

import lxml.html
import pytest

pl_sketch = importlib.import_module("pl-sketch")

POINT_SKETCH_HTML = """
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

POINT_SKETCH_WITH_INITIAL_HTML = """
    <pl-sketch answers-name="graph" width="400" height="400">
        <pl-sketch-tool
            id="initial-point"
            type="point"
            read-only="true"
        ></pl-sketch-tool>
        <pl-sketch-tool id="point" type="point"></pl-sketch-tool>
        <pl-sketch-grade
            type="match"
            tool-id="point"
            x="0"
            y="0"
        ></pl-sketch-grade>
        <pl-sketch-initial
            tool-id="initial-point"
            coordinates="(-1, -1)"
        ></pl-sketch-initial>
        <pl-sketch-solution
            tool-id="point"
            coordinates="(0, 0)"
        ></pl-sketch-solution>
    </pl-sketch>
"""

READ_ONLY_INITIAL_CURVE_SKETCH_HTML = """
    <pl-sketch answers-name="graph" width="400" height="400">
        <pl-sketch-tool
            id="curve"
            type="spline"
            read-only="true"
        ></pl-sketch-tool>
        <pl-sketch-grade
            type="match-function"
            tool-id="curve"
            function="0"
            x-range="-1,1"
        ></pl-sketch-grade>
        <pl-sketch-initial
            tool-id="curve"
            coordinates="(-1, 0), (1, 0)"
        ></pl-sketch-initial>
        <pl-sketch-solution
            tool-id="curve"
            coordinates="(-1, -1), (1, 1)"
        ></pl-sketch-solution>
    </pl-sketch>
"""

EDITABLE_INITIAL_CURVE_SKETCH_HTML = """
    <pl-sketch answers-name="graph" width="400" height="400">
        <pl-sketch-tool id="curve" type="spline"></pl-sketch-tool>
        <pl-sketch-grade
            type="match-function"
            tool-id="curve"
            function="x"
            x-range="-1,1"
        ></pl-sketch-grade>
        <pl-sketch-initial
            tool-id="curve"
            coordinates="(-1, 0), (1, 0)"
        ></pl-sketch-initial>
        <pl-sketch-solution
            tool-id="curve"
            coordinates="(-1, -1), (1, 1)"
        ></pl-sketch-solution>
    </pl-sketch>
"""

VERTICAL_LINE_SKETCH_HTML = """
    <pl-sketch answers-name="graph" width="400" height="400">
        <pl-sketch-tool id="vertical" type="vertical-line"></pl-sketch-tool>
        <pl-sketch-grade
            type="match"
            tool-id="vertical"
            x="0"
        ></pl-sketch-grade>
        <pl-sketch-solution
            tool-id="vertical"
            coordinates="0"
        ></pl-sketch-solution>
    </pl-sketch>
"""


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


def _run_submission_lifecycle(
    element_html: str, test_type: Literal["correct", "incorrect"]
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    data["test_type"] = test_type

    pl_sketch.test(element_html, data)
    data["submitted_answers"] = data["raw_submitted_answers"].copy()
    pl_sketch.parse(element_html, data)
    pl_sketch.grade(element_html, data)
    rendered_html = pl_sketch.render(element_html, data)

    raw_submission = data["raw_submitted_answers"]["graph-sketchresponse-submission"]
    submission = json.loads(base64.b64decode(raw_submission).decode("utf-8"))
    rendered = lxml.html.fragment_fromstring(rendered_html, create_parent=True)
    encoded_config = rendered.xpath('.//div[contains(@id, "-sketchresponse-data")]')[
        0
    ].text
    config = json.loads(base64.b64decode(encoded_config).decode("utf-8"))

    return data, submission, config


def _render_config(element_html: str, data: dict[str, Any]) -> dict[str, Any]:
    rendered = lxml.html.fragment_fromstring(
        pl_sketch.render(element_html, data), create_parent=True
    )
    encoded = rendered.xpath('.//div[contains(@id, "-sketchresponse-data")]')[0].text
    return json.loads(base64.b64decode(encoded))


@pytest.mark.parametrize(
    ("tool_type", "coordinates"),
    [
        ("point", "(-1,-1)"),
        ("line", "(-1,-1),(1,1)"),
        ("horizontal-line", "-1"),
        ("vertical-line", "-1"),
        ("free-draw", "(-1,-1),(1,1)"),
        ("spline", "(-1,-1),(1,1)"),
        ("polyline", "(-1,-1),(1,1)"),
        ("polygon", "(-1,-1),(1,1),(1,-1)"),
    ],
)
def test_fixed_tags_use_existing_tool_presentation(
    tool_type: str, coordinates: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    html = rf"""<pl-sketch answers-name="graph">
        <pl-sketch-tool id="given" type="{tool_type}" read-only="true"></pl-sketch-tool>
        <pl-sketch-initial tool-id="given" coordinates="{coordinates}" tag="Point \(A_1\)"></pl-sketch-initial>
        <pl-sketch-initial tool-id="given" coordinates="{coordinates}"></pl-sketch-initial>
    </pl-sketch>"""
    data = _make_question_data()
    pl_sketch.prepare(html, data)
    before = copy.deepcopy(data["params"])
    config = _render_config(html, data)
    tool = next(tool for tool in config["plugins"] if tool.get("id") == "given")
    assert tool["readonly"] is True
    assert tool["tag"]["mathjax"] is True
    assert "latex" not in tool["tag"]
    drawings = config["initialstate"]["given"]
    points = (
        [point for drawing in drawings for point in drawing]
        if isinstance(drawings[0], list)
        else drawings
    )
    assert [point["tag"] for point in points if "tag" in point] == [r"Point \(A_1\)"]
    assert data["params"] == before


TAGGED_REFERENCE_HTML = r"""<pl-sketch answers-name="graph">
    <pl-sketch-tool id="given" type="point" read-only="true" group="References"></pl-sketch-tool>
    <pl-sketch-tool id="response" type="point"></pl-sketch-tool>
    <pl-sketch-initial tool-id="given" coordinates="(-1,-1)" tag="Point \(A_1\)"></pl-sketch-initial>
    <pl-sketch-grade type="match" tool-id="response" x="1" y="1"></pl-sketch-grade>
    <pl-sketch-solution tool-id="response" coordinates="(1,1)" tag="Origin \(B_1\)"></pl-sketch-solution>
</pl-sketch>"""


@pytest.mark.parametrize("panel", ["question", "submission", "answer"])
def test_fixed_references_persist_and_solutions_do_not_tag_student_tools(
    panel: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data = _make_question_data()
    data["panel"] = panel
    data["editable"] = True
    pl_sketch.prepare(TAGGED_REFERENCE_HTML, data)
    params = data["params"]["graph"]
    data["raw_submitted_answers"]["graph-sketchresponse-submission"] = base64.b64encode(
        json.dumps({
            "data": {
                "given": [{"x": 1, "y": 2, "tag": "changed"}],
                "response": [{"x": 20, "y": 30}],
            }
        }).encode()
    ).decode()
    before = copy.deepcopy(params)
    config = _render_config(TAGGED_REFERENCE_HTML, data)
    assert config["initialstate"]["given"] == params["initial_state"]["given"]
    reference = next(tool for tool in config["plugins"] if tool["name"] == "group")[
        "plugins"
    ][0]
    assert "latex" not in reference["tag"]
    assert reference["tag"]["mathjax"] is True
    response = next(tool for tool in config["plugins"] if tool.get("id") == "response")
    if panel == "answer":
        assert (
            config["initialstate"]["response"] == params["solution_state"]["response"]
        )
        assert "latex" not in response["tag"]
        assert response["tag"]["mathjax"] is True
    else:
        assert config["initialstate"]["response"] == [{"x": 20, "y": 30}]
        assert "tag" not in response
    assert params == before


def test_solution_overlays_keep_tags_separate_from_student_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data = _make_question_data()
    data["panel"] = "question"
    data["editable"] = True
    data["correct_answer_shown"] = True
    pl_sketch.prepare(TAGGED_REFERENCE_HTML, data)
    config = _render_config(TAGGED_REFERENCE_HTML, data)
    overlay = next(tool for tool in config["plugins"] if tool.get("overlay"))
    assert overlay["id"] == "response-solution-overlay"
    assert overlay["readonly"] is True
    assert "latex" not in overlay["tag"]
    assert overlay["tag"]["mathjax"] is True
    assert config["initialstate"][overlay["id"]][0]["tag"] == r"Origin \(B_1\)"
    assert "tag" not in next(
        tool for tool in config["plugins"] if tool.get("id") == "response"
    )


@pytest.mark.parametrize(("test_type", "score"), [("correct", 1), ("incorrect", 0)])
def test_generated_answers_preserve_reference_tags_without_solution_annotations(
    test_type: Literal["correct", "incorrect"],
    score: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data, submission, _ = _run_submission_lifecycle(TAGGED_REFERENCE_HTML, test_type)
    assert "graph" not in data["format_errors"]
    assert data["partial_scores"]["graph"]["score"] == score
    assert submission["data"]["given"][0]["tag"] == r"Point \(A_1\)"
    assert submission["gradeable"]["given"][0]["tag"] == r"Point \(A_1\)"
    assert "tag" not in submission["data"]["response"][0]
    assert "tag" not in submission["gradeable"]["response"][0]


def test_tagged_initial_requires_readonly_but_accepts_readonly_canvas() -> None:
    html = """<pl-sketch answers-name="graph">
        <pl-sketch-tool id="curve" type="spline"></pl-sketch-tool>
        <pl-sketch-initial tool-id="curve" function="x" tag="f(x)"></pl-sketch-initial>
    </pl-sketch>"""
    with pytest.raises(ValueError, match="requires a read-only tool or canvas"):
        pl_sketch.prepare(html, _make_question_data())
    data = _make_question_data()
    pl_sketch.prepare(
        html.replace('answers-name="graph"', 'answers-name="graph" read-only="true"'),
        data,
    )
    assert data["params"]["graph"]["initial_state"]["curve"][0][0]["tag"] == "f(x)"


def test_answer_solution_replaces_reference_for_the_same_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    html = TAGGED_REFERENCE_HTML.replace(
        "</pl-sketch>",
        '<pl-sketch-solution tool-id="given" coordinates="(0,0)" tag="A_2"></pl-sketch-solution></pl-sketch>',
    )
    data = _make_question_data()
    data["panel"] = "answer"
    pl_sketch.prepare(html, data)
    config = _render_config(html, data)
    assert (
        config["initialstate"]["given"]
        == data["params"]["graph"]["solution_state"]["given"]
    )
    assert config["initialstate"]["given"][0]["tag"] == "A_2"


def test_saved_variants_without_tag_settings_still_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data = _make_question_data()
    pl_sketch.prepare(POINT_SKETCH_WITH_INITIAL_HTML, data)
    params = data["params"]["graph"]
    for tool in params["tool_data"].values():
        tool.pop("tag", None)
    config = _render_config(POINT_SKETCH_WITH_INITIAL_HTML, data)
    assert config["initialstate"] == params["initial_state"]
    assert all("tag" not in tool for tool in config["plugins"])


def test_generated_line_reference_uses_flat_client_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    html = TAGGED_REFERENCE_HTML.replace(
        'id="given" type="point"', 'id="given" type="line"'
    ).replace('coordinates="(-1,-1)"', 'coordinates="(-1,-1),(1,-1)"')
    data, submission, _ = _run_submission_lifecycle(html, "correct")
    assert data["partial_scores"]["graph"]["score"] == 1
    assert len(submission["data"]["given"]) == 2
    line = submission["gradeable"]["given"][0]
    assert len(line["spline"]) == 4
    assert line["tag"] == r"Point \(A_1\)"
    start, end = submission["data"]["given"]
    assert line["spline"][0] == [start["x"], start["y"]]
    assert line["spline"][-1] == [end["x"], end["y"]]


def test_answer_without_solutions_keeps_fixed_references(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element = lxml.html.fragment_fromstring(TAGGED_REFERENCE_HTML)
    element.remove(element.findall("pl-sketch-solution")[0])
    html = lxml.html.tostring(element, encoding="unicode")
    data = _make_question_data()
    data["panel"] = "answer"
    pl_sketch.prepare(html, data)
    config = _render_config(html, data)
    assert config["initialstate"] == data["params"]["graph"]["initial_state"]


def test_corrupt_saved_state_falls_back_to_instructor_initial_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data = _make_question_data()
    pl_sketch.prepare(TAGGED_REFERENCE_HTML, data)
    data["raw_submitted_answers"]["graph-sketchresponse-submission"] = base64.b64encode(
        json.dumps({"data": []}).encode()
    ).decode()
    config = _render_config(TAGGED_REFERENCE_HTML, data)
    assert config["initialstate"] == data["params"]["graph"]["initial_state"]


def test_axis_labels_are_configurable() -> None:
    element_html = """
        <pl-sketch
            answers-name="graph"
            width="400"
            height="400"
            x-axis-label="Time (s)"
            y-axis-label="Distance (m)"
            x-label-gap="7"
            x-label-inset="13"
            y-label-gap="17"
            y-label-inset="23"
        ></pl-sketch>
    """
    data = _make_question_data()

    pl_sketch.prepare(element_html, data)

    axes_plugin = data["params"]["graph"]["config"]["plugins"][0]
    assert axes_plugin["xaxisLabel"] == {
        "value": "Time (s)",
        "dx": 13,
        "dy": 7,
    }
    assert axes_plugin["yaxisLabel"] == {
        "value": "Distance (m)",
        "dx": 17,
        "dy": 23,
    }


def test_axis_label_defaults_preserve_existing_positions() -> None:
    data = _make_question_data()

    pl_sketch.prepare(POINT_SKETCH_HTML, data)

    axes_plugin = data["params"]["graph"]["config"]["plugins"][0]
    assert axes_plugin["xaxisLabel"] == {"value": "x", "dx": 10, "dy": 10}
    assert axes_plugin["yaxisLabel"] == {"value": "y", "dx": 10, "dy": 20}


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
    data, submission, config = _run_submission_lifecycle(POINT_SKETCH_HTML, test_type)

    assert "graph" not in data["format_errors"]
    assert data["partial_scores"]["graph"]["score"] == expected_score
    assert config["initialstate"] == submission["data"]
    point = submission["data"]["point"][0]
    assert submission["gradeable"]["point"] == [{"point": [point["x"], point["y"]]}]


@pytest.mark.parametrize(
    ("test_type", "solution_y_offset"),
    [
        ("correct", 0),
        ("incorrect", 200),
    ],
)
def test_generated_submission_combines_initial_and_solution_drawings(
    test_type: Literal["correct", "incorrect"],
    solution_y_offset: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data, submission, config = _run_submission_lifecycle(
        POINT_SKETCH_WITH_INITIAL_HTML, test_type
    )

    initial_point = data["params"]["graph"]["initial_state"]["initial-point"][0]
    solution_point = data["params"]["graph"]["solution_state"]["point"][0]
    expected_solution_point = {
        **solution_point,
        "y": solution_point["y"] + solution_y_offset,
    }
    assert submission["data"] == {
        "initial-point": [initial_point],
        "point": [expected_solution_point],
    }
    assert submission["gradeable"] == {
        "initial-point": [{"point": [initial_point["x"], initial_point["y"]]}],
        "point": [
            {"point": [expected_solution_point["x"], expected_solution_point["y"]]}
        ],
    }
    assert config["initialstate"] == submission["data"]


@pytest.mark.parametrize(
    ("test_type", "expected_score", "matches_solution"),
    [
        ("correct", 1, True),
        ("incorrect", 0, False),
    ],
)
def test_generated_submission_replaces_editable_initial_curve(
    test_type: Literal["correct", "incorrect"],
    expected_score: int,
    matches_solution: bool,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data, submission, config = _run_submission_lifecycle(
        EDITABLE_INITIAL_CURVE_SKETCH_HTML, test_type
    )

    solution_curve = data["params"]["graph"]["solution_state"]["curve"]
    assert "graph" not in data["format_errors"]
    assert data["partial_scores"]["graph"]["score"] == expected_score
    assert (submission["data"] == {"curve": solution_curve}) is matches_solution
    assert config["initialstate"] == submission["data"]


def test_generated_submission_preserves_read_only_initial_curve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    data, submission, config = _run_submission_lifecycle(
        READ_ONLY_INITIAL_CURVE_SKETCH_HTML, "correct"
    )

    initial_curve = data["params"]["graph"]["initial_state"]["curve"]
    solution_curve = data["params"]["graph"]["solution_state"]["curve"]
    assert "graph" not in data["format_errors"]
    assert data["partial_scores"]["graph"]["score"] == 1
    assert initial_curve != solution_curve
    assert submission["data"] == {"curve": initial_curve}
    assert config["initialstate"] == submission["data"]


def test_generated_incorrect_vertical_line_differs_from_correct(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    correct_data, correct_submission, _ = _run_submission_lifecycle(
        VERTICAL_LINE_SKETCH_HTML, "correct"
    )
    incorrect_data, incorrect_submission, incorrect_config = _run_submission_lifecycle(
        VERTICAL_LINE_SKETCH_HTML, "incorrect"
    )

    correct_line = correct_submission["data"]["vertical"][0]
    incorrect_line = incorrect_submission["data"]["vertical"][0]
    assert incorrect_line["x"] != correct_line["x"]
    assert incorrect_submission != correct_submission
    assert correct_data["partial_scores"]["graph"]["score"] == 1
    assert incorrect_data["partial_scores"]["graph"]["score"] == 0
    assert incorrect_config["initialstate"] == incorrect_submission["data"]


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


def test_free_draw_coordinate_solution_preserves_control_points() -> None:
    element_html = """
        <pl-sketch answers-name="graph" x-range="-5,5" y-range="-5,5" width="400" height="400">
            <pl-sketch-tool id="curve" type="free-draw"></pl-sketch-tool>
            <pl-sketch-grade type="count" tool-id="curve" count="1"></pl-sketch-grade>
            <pl-sketch-solution
                tool-id="curve"
                coordinates="(-4,-3),(-3,-1),(-2,2),(-1,4)"
            ></pl-sketch-solution>
        </pl-sketch>
    """
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    solution_curve = data["params"]["graph"]["solution_state"]["curve"][0]
    expected_gradeable = {
        "spline": [[point["x"], point["y"]] for point in solution_curve]
    }
    data["test_type"] = "correct"

    pl_sketch.test(element_html, data)

    raw_submission = data["raw_submitted_answers"]["graph-sketchresponse-submission"]
    submission = json.loads(base64.b64decode(raw_submission).decode("utf-8"))
    assert submission["gradeable"]["curve"] == [expected_gradeable]


def test_free_draw_solution_preserves_disconnected_curves() -> None:
    element_html = """
        <pl-sketch answers-name="graph" x-range="-5,5" y-range="-5,5" width="400" height="400">
            <pl-sketch-tool id="curves" type="free-draw"></pl-sketch-tool>
            <pl-sketch-grade type="count" tool-id="curves" count="2"></pl-sketch-grade>
            <pl-sketch-solution
                tool-id="curves"
                function="x"
                x-range="-4,-1"
            ></pl-sketch-solution>
            <pl-sketch-solution
                tool-id="curves"
                function="x"
                x-range="1,4"
            ></pl-sketch-solution>
        </pl-sketch>
    """
    data = _make_question_data()
    pl_sketch.prepare(element_html, data)
    solution_curves = data["params"]["graph"]["solution_state"]["curves"]
    assert len(solution_curves) == 2
    expected_gradeable = [
        {"spline": [[point["x"], point["y"]] for point in curve]}
        for curve in solution_curves
    ]
    data["test_type"] = "correct"

    pl_sketch.test(element_html, data)

    raw_submission = data["raw_submitted_answers"]["graph-sketchresponse-submission"]
    submission = json.loads(base64.b64decode(raw_submission).decode("utf-8"))
    assert submission["gradeable"]["curves"] == expected_gradeable

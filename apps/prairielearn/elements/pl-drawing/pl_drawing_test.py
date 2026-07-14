import importlib
import json
import math

pl_drawing = importlib.import_module("pl-drawing")


def build_element_html(
    answers_name: str = "test",
    gradable: bool = True,
    weight: int | None = None,
    allow_blank: bool | None = None,
    show_score: bool | None = None,
) -> str:
    attrs = [f'answers-name="{answers_name}"', f'gradable="{str(gradable).lower()}"']
    if weight is not None:
        attrs.append(f'weight="{weight}"')
    if allow_blank is not None:
        attrs.append(f'allow-blank="{str(allow_blank).lower()}"')
    if show_score is not None:
        attrs.append(f'show-score="{str(show_score).lower()}"')

    return f"""<pl-drawing {" ".join(attrs)}>
        <pl-drawing-answer>
            <pl-point x1="100" y1="100"></pl-point>
        </pl-drawing-answer>
    </pl-drawing>"""


def make_question_data(
    submitted_answers: dict | None = None,
    correct_answers: dict | None = None,
    format_errors: dict | None = None,
    partial_scores: dict | None = None,
) -> dict:
    return {
        "submitted_answers": submitted_answers or {},
        "correct_answers": correct_answers or {},
        "format_errors": format_errors or {},
        "partial_scores": partial_scores or {},
        "extensions": {},
    }


def test_parse_blank_submission_without_allow_blank_sets_error() -> None:
    element_html = build_element_html(allow_blank=False)
    data = make_question_data(submitted_answers={"test": "[]"})

    pl_drawing.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


def test_parse_malformed_json_with_allow_blank_sets_error() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(submitted_answers={"test": "not json"})

    pl_drawing.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


def test_parse_blank_submission_with_allow_blank_no_error() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(submitted_answers={"test": "[]"})

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]


def test_parse_none_submission_with_allow_blank_no_error() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(submitted_answers={})

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]


def test_parse_valid_submission_works_with_allow_blank() -> None:
    element_html = build_element_html(allow_blank=True)
    valid_answer = [{"id": 1, "type": "pl-point", "x1": 100, "y1": 100}]
    data = make_question_data(submitted_answers={"test": json.dumps(valid_answer)})

    pl_drawing.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert data["submitted_answers"]["test"] == valid_answer


def test_prepare_uses_parent_tolerance_for_error_boxes() -> None:
    element_html = """
    <pl-drawing answers-name="test" gradable="true" grid-size="20" tol="5">
        <pl-drawing-answer draw-error-box="true">
            <pl-point x1="100" y1="100"></pl-point>
            <pl-drawing-group>
                <pl-controlled-line
                    x1="20"
                    y1="40"
                    x2="60"
                    y2="40"
                    offset-tol-x="3"
                    offset-tol-y="4"
                ></pl-controlled-line>
            </pl-drawing-group>
        </pl-drawing-answer>
    </pl-drawing>
    """
    data = make_question_data()

    pl_drawing.prepare(element_html, data)

    point, line = data["correct_answers"]["test"]
    assert point["drawErrorBox"] is True
    assert point["widthErrorBox"] == 10
    assert point["heightErrorBox"] == 10
    assert line["drawErrorBox"] is True
    assert line["widthErrorBox"] == 16
    assert line["heightErrorBox"] == 18


def test_prepare_uses_parent_grid_size_for_default_tolerance() -> None:
    element_html = """
    <pl-drawing answers-name="test" gradable="true" grid-size="12">
        <pl-drawing-answer draw-error-box="true">
            <pl-point x1="100" y1="100"></pl-point>
        </pl-drawing-answer>
    </pl-drawing>
    """
    data = make_question_data()

    pl_drawing.prepare(element_html, data)

    point = data["correct_answers"]["test"][0]
    assert point["widthErrorBox"] == 12
    assert point["heightErrorBox"] == 12


def test_parent_grid_size_does_not_change_paired_vector_position_defaults() -> None:
    element_html = """
    <pl-drawing answers-name="test" gradable="true" grid-size="0" tol="5">
        <pl-drawing-answer>
            <pl-paired-vector></pl-paired-vector>
        </pl-drawing-answer>
    </pl-drawing>
    """
    data = make_question_data()

    pl_drawing.prepare(element_html, data)

    paired_vector = data["correct_answers"]["test"][0]
    assert paired_vector["x1"] == 40
    assert paired_vector["y1"] == 20
    assert paired_vector["x2"] == 60
    assert paired_vector["y2"] == 40


def test_grade_blank_submission_without_allow_blank_sets_error() -> None:
    element_html = build_element_html(allow_blank=False)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "test" not in data["partial_scores"]


def test_grade_blank_with_all_optional_refs_scores_full() -> None:
    element_html = build_element_html(allow_blank=True)
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "optional_grading": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert math.isclose(data["partial_scores"]["test"]["score"], 1.0)


def test_grade_blank_submission_with_allow_blank_scores_zero() -> None:
    element_html = build_element_html(allow_blank=True)
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert math.isclose(data["partial_scores"]["test"]["score"], 0.0)


def test_grade_blank_submission_with_allow_blank_uses_weight() -> None:
    element_html = build_element_html(allow_blank=True, weight=5)
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 5


def test_grade_blank_submission_with_allow_blank_feedback_structure() -> None:
    element_html = build_element_html(allow_blank=True)
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    feedback = data["partial_scores"]["test"]["feedback"]
    assert feedback["correct"] is False
    assert feedback["partial"] is False
    assert feedback["incorrect"] is True
    assert "missing" in feedback
    assert "matches" in feedback


def test_grade_uses_custom_weight() -> None:
    element_html = build_element_html(weight=3, allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": []},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 3


def test_grade_default_weight_is_one() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": []},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 1


def test_grade_only_initial_objects_without_allow_blank_sets_error() -> None:
    element_html = build_element_html(allow_blank=False)
    initial_objects = [
        {
            "id": 0,
            "type": "pl-rectangle",
            "gradingName": "pl-rectangle",
            "graded": False,
            "left": 100,
            "top": 100,
            "width": 50,
            "height": 50,
        }
    ]
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": initial_objects},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "test" not in data["partial_scores"]


def test_grade_only_initial_objects_with_allow_blank_scores_zero() -> None:
    element_html = build_element_html(allow_blank=True)
    initial_objects = [
        {
            "id": 0,
            "type": "pl-rectangle",
            "gradingName": "pl-rectangle",
            "graded": False,
            "left": 100,
            "top": 100,
            "width": 50,
            "height": 50,
        }
    ]
    reference = [
        {
            "id": 0,
            "type": "pl-point",
            "gradingName": "pl-point",
            "graded": True,
            "x1": 100,
            "y1": 100,
        }
    ]
    data = make_question_data(
        submitted_answers={"test": initial_objects},
        correct_answers={"test": reference},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert math.isclose(data["partial_scores"]["test"]["score"], 0.0)

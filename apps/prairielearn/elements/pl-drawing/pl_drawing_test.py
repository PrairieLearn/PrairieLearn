import importlib
import json

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


def test_grade_blank_submission_without_allow_blank_sets_error() -> None:
    element_html = build_element_html(allow_blank=False)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert "test" in data["format_errors"]
    assert "test" not in data["partial_scores"]


def test_grade_blank_submission_with_allow_blank_scores_zero() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert "test" not in data["format_errors"]
    assert "test" in data["partial_scores"]
    assert data["partial_scores"]["test"]["score"] == 0.0


def test_grade_blank_submission_with_allow_blank_uses_weight() -> None:
    element_html = build_element_html(allow_blank=True, weight=5)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
    )

    pl_drawing.grade(element_html, data)

    assert data["partial_scores"]["test"]["weight"] == 5


def test_grade_blank_submission_with_allow_blank_feedback_structure() -> None:
    element_html = build_element_html(allow_blank=True)
    data = make_question_data(
        submitted_answers={"test": None},
        correct_answers={"test": []},
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
    assert data["partial_scores"]["test"]["score"] == 0.0

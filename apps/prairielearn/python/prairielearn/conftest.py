import pytest
from prairielearn import QuestionData


@pytest.fixture
def question_data() -> QuestionData:
    return {
        "params": dict(),
        "correct_answers": dict(),
        "submitted_answers": dict(),
        "format_errors": dict(),
        "partial_scores": dict(),
        "score": 0.0,
        "feedback": dict(),
        "variant_seed": "",
        "options": dict(),
        "raw_submitted_answers": dict(),
        "editable": False,
        "panel": "question",
        "extensions": dict(),
        "num_valid_submissions": 0,
        "manual_grading": False,
        "answers_names": dict(),
    }

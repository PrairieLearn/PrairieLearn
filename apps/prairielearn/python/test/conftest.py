import pytest
from prairielearn import QuestionData


@pytest.fixture
def question_data() -> QuestionData:
    return {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "score": 0.0,
        "feedback": {},
        "variant_seed": "",
        "options": {},
        "raw_submitted_answers": {},
        "editable": False,
        "panel": "question",
        "extensions": {},
        "num_valid_submissions": 0,
        "manual_grading": False,
        "ai_grading": False,
        "answers_names": {},
    }

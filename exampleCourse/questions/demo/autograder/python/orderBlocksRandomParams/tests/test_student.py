import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import (
    DataFixture,
    FeedbackFixture,
    StudentFixture,
)
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(student_code_pattern="user_code.py")


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Check return value", points=1)
def test_0(
    sandbox: StudentFixture, data_json: DataFixture, feedback: FeedbackFixture
) -> None:
    user_val = sandbox.query_function("return_number")
    number_type = data_json["params"]["type"]
    assert_true(
        ((user_val % 2 == 0) and (number_type == "even"))
        or ((user_val % 2 != 0) and (number_type == "odd")),
        msg="The return value is not correct.",
    )
    feedback.add_message("Your answer is correct.")

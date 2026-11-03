import pytest
from pytest_prairielearn_grader.assertions import assert_equal
from pytest_prairielearn_grader.fixture import (
    DataFixture,
    FeedbackFixture,
    StudentFixture,
)


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="Test expected inputs", points=4)
def test_input(
    sandbox: StudentFixture, data_json: DataFixture, feedback: FeedbackFixture
) -> None:
    params = data_json["params"]
    function_name = params["function_name"]
    num_correct = 0
    failures = []

    for pair in params["pairs"]:
        func_input = pair["input"]
        expected_output = pair["output"]
        try:
            assert_equal(
                sandbox.query_function(function_name, func_input),
                expected_output,
                description=f'{function_name}("{func_input}")',
            )
        except (AssertionError, RuntimeError) as error:
            failures.append(str(error))
        else:
            num_correct += 1

    if failures:
        feedback.add_message("\n\n".join(failures))
    feedback.set_score_final(num_correct / len(params["pairs"]))


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="Test default output", points=1)
def test_default_output(
    sandbox: StudentFixture, data_json: DataFixture, feedback: FeedbackFixture
) -> None:
    params = data_json["params"]
    function_name = params["function_name"]
    func_input = params["invalid_input"]
    expected_output = params["default_output"]

    try:
        assert_equal(
            sandbox.query_function(function_name, func_input),
            expected_output,
            description=f'{function_name}("{func_input}")',
        )
    except (AssertionError, RuntimeError) as error:
        feedback.add_message(str(error))
        feedback.set_score_final(0)
    else:
        feedback.set_score_final(1)

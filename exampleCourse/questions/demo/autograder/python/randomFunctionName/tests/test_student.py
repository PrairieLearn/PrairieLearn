import pytest
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import (
    DataFixture,
    FeedbackFixture,
    StudentFixture,
)
from pytest_prairielearn_grader.utils import FunctionStatusCode, GradingOutputLevel


@pytest.mark.output(level=GradingOutputLevel.Friendly)
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
        response = sandbox.query_function_raw(function_name, func_input)
        if response["status"] == FunctionStatusCode.TIMEOUT:
            # A late reply would otherwise be read as the answer to the next input.
            failures.append(f'{function_name}("{func_input}"): timed out')
            break
        if (
            response["status"] == FunctionStatusCode.SUCCESS
            and response["value"] == expected_output
        ):
            num_correct += 1
        else:
            failures.append(
                _format_failure(function_name, func_input, expected_output, response)
            )

    if failures:
        feedback.add_message("\n\n".join(failures))
    feedback.set_score_final(num_correct / len(params["pairs"]))


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Test default output", points=1)
def test_default_output(sandbox: StudentFixture, data_json: DataFixture) -> None:
    params = data_json["params"]
    function_name = params["function_name"]
    func_input = params["invalid_input"]
    expected_output = params["default_output"]

    assert_fn_equal(
        sandbox,
        function_name,
        args=(func_input,),
        expected=expected_output,
        description=f'{function_name}("{func_input}")',
    )


def _format_failure(
    function_name: str, func_input: str, expected: str, response: dict
) -> str:
    description = f'{function_name}("{func_input}")'
    if response["status"] == FunctionStatusCode.SUCCESS:
        return f"{description}: expected {expected}, got {response['value']}"
    return (
        f"{description}: raised {response['exception_name']}: "
        f"{response['exception_message']}"
    )

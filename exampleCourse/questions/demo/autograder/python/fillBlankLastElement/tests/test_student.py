import random

import pytest
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import FunctionStatusCode


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="last_element", points=10)
def test_last_element(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    num_tests = 10
    num_correct = 0
    failures = []

    for _ in range(num_tests):
        lst = random.sample(range(1000), k=random.randint(1, 20))
        description = f"last_element({lst})"
        response = sandbox.query_function_raw("last_element", lst)
        if response["status"] == FunctionStatusCode.TIMEOUT:
            # A late reply would otherwise be read as the answer to the next input.
            failures.append(f"{description}: timed out")
            break
        if (
            response["status"] == FunctionStatusCode.SUCCESS
            and response["value"] == lst[-1]
        ):
            num_correct += 1
        else:
            failures.append(_format_failure(description, lst[-1], response))

    if failures:
        feedback.add_message("\n\n".join(failures))
    feedback.set_score_final(num_correct / num_tests)


def _format_failure(description: str, expected: int, response: dict) -> str:
    if response["status"] == FunctionStatusCode.SUCCESS:
        return f"{description}: expected {expected}, got {response['value']}"
    return (
        f"{description}: raised {response['exception_name']}: "
        f"{response['exception_message']}"
    )

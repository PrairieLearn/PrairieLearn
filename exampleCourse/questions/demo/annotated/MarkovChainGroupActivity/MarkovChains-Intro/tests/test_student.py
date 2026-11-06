import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.json_utils import from_json
from pytest_prairielearn_grader.utils import FunctionStatusCode, GradingOutputLevel

autograder_config = ConfigObject(
    student_code_pattern="Markov-Chains-1.ipynb",
    notebook_cell_tag="#grade",
    # Importing numpy in student code can take longer than the default timeout.
    sandbox_timeout=15,
)


def _power_iteration(M: np.ndarray, x: np.ndarray) -> np.ndarray:
    xc = x.copy()
    for _ in range(100):
        xc = M @ xc
    return xc


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Testing function power_iteration", points=1)
def test_power_iteration(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    test_cases = [
        (
            "The return value from your function power_iteration",
            np.array([[0.3, 0.1], [0.7, 0.9]]),
            np.array([1.0, 0.0]),
        ),
        (
            "The return value from your function power_iteration (hidden test case)",
            np.array([[0.4, 0.2], [0.6, 0.8]]),
            np.array([0.0, 1.0]),
        ),
    ]
    num_correct = 0
    failures = []

    for description, M, x in test_cases:
        response = sandbox.query_function_raw("power_iteration", M, x)
        if response["status"] == FunctionStatusCode.TIMEOUT:
            # A late reply would otherwise be read as the answer to the next case.
            failures.append(f"{description}: timed out")
            break
        if response["status"] != FunctionStatusCode.SUCCESS:
            failures.append(
                f"{description}: {response['exception_name']}: "
                f"{response['exception_message']}"
            )
            continue

        value = from_json(response["value"])
        if value is None:
            failures.append(f"{description}: your function isn't returning anything")
        elif _is_close(value, _power_iteration(M, x)):
            num_correct += 1
        else:
            failures.append(f"{description} is inaccurate")

    if failures:
        feedback.add_message("\n\n".join(failures))
    feedback.set_score_final(num_correct / len(test_cases))


def _is_close(value: object, expected: np.ndarray) -> bool:
    return (
        isinstance(value, np.ndarray)
        and np.issubdtype(value.dtype, np.number)
        and value.shape == expected.shape
        and bool(np.allclose(value, expected))
    )

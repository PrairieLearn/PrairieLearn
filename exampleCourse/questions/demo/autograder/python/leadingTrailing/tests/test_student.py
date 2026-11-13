import numpy as np
import pytest
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import FunctionStatusCode


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="gradient_descent()", points=1)
def test_0(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    tests = 50
    num_correct = 0
    xs = np.linspace(-1, 1, tests)
    alphas = np.linspace(0.1, 0.001, tests)
    np.random.shuffle(xs)
    np.random.shuffle(alphas)

    for x, alpha in zip(xs, alphas, strict=True):
        name = f"x={x}, alpha={alpha}"
        response = sandbox.query_function_raw(
            "gradient_descent", float(x), float(alpha)
        )
        if response["status"] == FunctionStatusCode.TIMEOUT:
            # A late reply would otherwise be read as the answer to the next input.
            feedback.add_message(f"{name}: timed out")
            break
        if response["status"] != FunctionStatusCode.SUCCESS:
            feedback.add_message(
                f"{name}: raised {response['exception_name']}: "
                f"{response['exception_message']}"
            )
            feedback.set_score_final(0)
            return

        value = response["value"]
        expected = x - alpha * (2 * x)
        if value is None:
            feedback.add_message(f"'{name}' is None or not defined")
        elif not isinstance(value, (complex, float, int, np.number)):
            feedback.add_message(f"'{name}' is not a number")
        elif (
            abs(expected - value) < abs(expected) * 1e-5 or abs(expected - value) < 1e-8
        ):
            num_correct += 1
            feedback.add_message(f"'{name}' looks good")
        else:
            feedback.add_message(f"'{name}' is inaccurate")

    feedback.set_score_final(num_correct / tests)

import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(
    student_code_pattern="user_code.py", sandbox_timeout=15
)


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="Check function my_dot_product", points=1)
def test_my_dot_product(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    a = np.random.rand(4)
    b = np.random.rand(4)
    actual = sandbox.query_function("my_dot_product", a, b)
    expected = np.inner(a, b)

    feedback.add_message(
        f"# Given two 1d numpy arrays:\n{a}\n{b}\n# Your function returns:\n{actual}"
    )
    name = "my_dot_product return value"
    assert_true(actual is not None, msg=f"'{name}' is None or not defined")
    assert_true(
        isinstance(actual, (complex, float, int, np.number)),
        msg=f"'{name}' is not a number",
    )
    assert_true(
        abs(expected - actual) < abs(expected) * 1e-5 or abs(expected - actual) < 1e-8,
        msg=f"'{name}' is inaccurate",
    )
    feedback.add_message(f"'{name}' looks good")

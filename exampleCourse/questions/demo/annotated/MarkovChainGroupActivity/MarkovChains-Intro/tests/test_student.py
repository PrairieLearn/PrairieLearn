import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

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
@pytest.mark.parametrize(
    ("M", "x"),
    [
        pytest.param(
            np.array([[0.3, 0.1], [0.7, 0.9]]),
            np.array([1.0, 0.0]),
            marks=pytest.mark.grading_data(
                name="Testing function power_iteration", points=0.5
            ),
            id="visible",
        ),
        pytest.param(
            np.array([[0.4, 0.2], [0.6, 0.8]]),
            np.array([0.0, 1.0]),
            marks=pytest.mark.grading_data(
                name="Testing function power_iteration (hidden test case)", points=0.5
            ),
            id="hidden",
        ),
    ],
)
def test_power_iteration(sandbox: StudentFixture, M: np.ndarray, x: np.ndarray) -> None:
    value = sandbox.query_function("power_iteration", M, x)
    assert_true(value is not None, msg="Your function isn't returning anything")
    assert_true(
        isinstance(value, np.ndarray), msg="Your function should return a numpy array"
    )

    try:
        np.testing.assert_allclose(
            value, _power_iteration(M, x), rtol=1e-5, atol=1e-8, strict=True
        )
    except AssertionError:
        # numpy's message includes the expected values, which would reveal the
        # hidden test case's answer.
        pytest.fail("The return value from your function power_iteration is inaccurate")

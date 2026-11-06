import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(
    student_code_pattern="Markov-Chains-2.ipynb",
    notebook_cell_tag="#grade",
    # leading_code.py uses staticmethod, which the sandbox doesn't allow by default.
    builtin_whitelist=["staticmethod"],
    # Importing numpy in student code can take longer than the default timeout.
    sandbox_timeout=15,
)

G = np.array([[1, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 1]])
XSTAR2 = np.linalg.matrix_power(G, 100) @ np.array([0.0, 0.0, 1.0, 0.0])


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.parametrize(
    ("name", "expected"),
    [
        pytest.param(
            "G",
            G,
            marks=pytest.mark.grading_data(
                name="Testing Gambler Markov Matrix G", points=1
            ),
            id="G",
        ),
        pytest.param(
            "xstar2",
            XSTAR2,
            marks=pytest.mark.grading_data(
                name="Testing probability of winning and losing xstar2", points=1
            ),
            id="xstar2",
        ),
    ],
)
def test_variable(sandbox: StudentFixture, name: str, expected: np.ndarray) -> None:
    value = sandbox.query(name)
    assert_true(isinstance(value, np.ndarray), msg=f"{name} should be a numpy array")

    try:
        np.testing.assert_allclose(
            value.astype(float), expected, rtol=1e-5, atol=1e-8, strict=True
        )
    except (AssertionError, TypeError, ValueError):
        # numpy's message includes the expected values, which are the answer.
        pytest.fail(f"{name} is inaccurate")

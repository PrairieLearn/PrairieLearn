import runpy
from pathlib import Path

import numpy as np
import numpy.linalg as la
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(
    student_code_pattern="Markov-Chains-3.ipynb",
    notebook_cell_tag="#grade",
    helper_modules=["pagerank_edges"],
    # Importing numpy in student code can take longer than the default timeout.
    sandbox_timeout=15,
)

A = np.array([[0, 2, 0, 5], [1, 0, 5, 6], [2, 4, 0, 3], [1, 0, 10, 2]])
M2 = A / la.norm(A, 1, axis=0)

# The grader runs this file with the rest of the tests folder moved into a folder named after it.
EDGES_FILE = Path(__file__).with_suffix("") / "pagerank_edges.py"
EDGES = runpy.run_path(str(EDGES_FILE))["EDGES"]
NUM_PAGES = 20
A2 = np.zeros((NUM_PAGES, NUM_PAGES))
for source, target in EDGES:
    A2[target, source] = 1
M3 = A2.copy()
M3[:, la.norm(A2, 1, axis=0) == 0] = 1 / NUM_PAGES
M3 /= la.norm(M3, 1, axis=0)


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.parametrize(
    ("name", "expected"),
    [
        pytest.param(
            "M2",
            M2,
            marks=pytest.mark.grading_data(
                name="Testing PageRank Markov Matrix M2", points=1
            ),
            id="M2",
        ),
        pytest.param(
            "M3",
            M3,
            marks=pytest.mark.grading_data(
                name="Testing larger example Markov Matrix M3", points=1
            ),
            id="M3",
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

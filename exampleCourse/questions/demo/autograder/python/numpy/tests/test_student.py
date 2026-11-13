import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(
    import_blacklist=[
        "os",
        "sys",
        "subprocess",
        "pathlib",
        "shutil",
        "numpy.linalg.inv",
        "numpy.linalg.pinv",
    ],
    sandbox_timeout=15,
)


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="x", points=1)
def test_x(sandbox: StudentFixture) -> None:
    A = sandbox.query_setup("A")
    b = sandbox.query_setup("b")
    expected = np.linalg.solve(A, b)

    x = sandbox.query("x")
    assert_true(isinstance(x, np.ndarray), msg="x is not a numpy array")
    assert_true(
        np.issubdtype(x.dtype, np.floating),
        msg=f"x does not have correct data type, got: {x.dtype}, expected: {expected.dtype}",
    )
    assert_true(
        x.shape == expected.shape,
        msg=f"x does not have correct shape, got: {x.shape}, expected: {expected.shape}",
    )
    assert_true(np.allclose(x, expected), msg="x is inaccurate")

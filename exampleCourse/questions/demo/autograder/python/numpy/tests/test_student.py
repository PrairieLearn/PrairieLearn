import numpy as np
import numpy.linalg as la
import pytest
from pytest_pl_grader.fixture import StudentFixture


@pytest.mark.grading_data(name="x", points=1)
def test_array_all_close(sandbox: StudentFixture) -> None:
    correct_x = la.solve(sandbox.query("A"), sandbox.query("b"))
    np.testing.assert_allclose(
        sandbox.query("x"), correct_x, err_msg="x is not correct"
    )

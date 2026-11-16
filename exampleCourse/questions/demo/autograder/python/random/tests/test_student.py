import numpy as np
import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_approx_equal
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

autograder_config = ConfigObject(sandbox_timeout=15)

N = 100


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="area", points=1)
def test_area(sandbox: StudentFixture) -> None:
    rng = np.random.RandomState(sandbox.query_setup("seed"))
    points = rng.uniform(-1, 1, size=(N, 2))
    num_pts = int(np.count_nonzero(points[:, 0] ** 2 + points[:, 1] ** 2 <= 1))
    expected = 4 * (num_pts / N)

    assert_approx_equal(
        sandbox.query("area"), expected, msg="area is inaccurate", description="area"
    )

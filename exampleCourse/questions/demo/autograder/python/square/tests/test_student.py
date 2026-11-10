import pytest
from pytest_prairielearn_grader.assertions import assert_approx_equal
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="x_sq", points=10)
def test_x_sq(sandbox: StudentFixture) -> None:
    x = sandbox.query_setup("x")
    assert_approx_equal(sandbox.query("x_sq"), x**2, description="x_sq")

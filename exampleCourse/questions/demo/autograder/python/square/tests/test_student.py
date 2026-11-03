import pytest
from pytest_prairielearn_grader.assertions import assert_equal
from pytest_prairielearn_grader.fixture import StudentFixture


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="x_sq", points=10)
def test_x_sq(sandbox: StudentFixture) -> None:
    x = sandbox.query_setup("x")
    x_sq = sandbox.query("x_sq")
    assert_equal(x_sq, x**2, description="x_sq")

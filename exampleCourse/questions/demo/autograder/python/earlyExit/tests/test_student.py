import math

import pytest
from pytest_prairielearn_grader.assertions import assert_approx_equal
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel


@pytest.fixture
def stop_after_failure(
    request: pytest.FixtureRequest, feedback: FeedbackFixture
) -> None:
    # Tests run in file order, so after a failure, every later test is skipped.
    if request.session.testsfailed:
        feedback.add_message("Grading was skipped because an earlier test failed.")
        pytest.skip("An earlier test failed.")


pytestmark = pytest.mark.usefixtures("stop_after_failure")


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="y", points=1)
def test_y(sandbox: StudentFixture, data_json: dict) -> None:
    x = data_json["params"]["x"]
    assert_approx_equal(sandbox.query("y"), x**2, description="y")


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="z", points=1)
def test_z(sandbox: StudentFixture, data_json: dict) -> None:
    x = data_json["params"]["x"]
    assert_approx_equal(sandbox.query("z"), math.sqrt(x**2 + 1), description="z")

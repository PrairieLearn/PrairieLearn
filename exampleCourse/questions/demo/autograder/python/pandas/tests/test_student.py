import pandas as pd
import pytest
from pandas.testing import assert_frame_equal
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="df", points=1)
def test_df(sandbox: StudentFixture) -> None:
    expected = pd.DataFrame(data={"a": [1, 2], "b": [3, 4]})
    df = sandbox.query("df")
    assert_true(isinstance(df, pd.DataFrame), msg="df is not a DataFrame")

    try:
        # check_like ignores row and column order.
        assert_frame_equal(expected, df, check_like=True)
    except AssertionError:
        pytest.fail(f"df is inaccurate\n----------\n{df.to_string(max_rows=9)}")

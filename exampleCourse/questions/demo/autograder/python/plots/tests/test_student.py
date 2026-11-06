import numpy as np
import pytest
from matplotlib.figure import Figure
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

# Importing matplotlib in student code can take longer than the default timeout.
sandbox_timeout = 15


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="plot", points=1)
def test_plot(sandbox: StudentFixture) -> None:
    figure = sandbox.query("plot")
    assert_true(
        isinstance(figure, Figure), msg="plot is not a MatplotlibSerializer object"
    )
    assert_true(len(figure.axes) == 1, msg="plot should have exactly one set of axes")
    axes = figure.axes[0]

    assert_true(
        axes.get_xscale() == "linear" and axes.get_yscale() == "log",
        msg="plot does not have the correct scale for its axes",
    )

    lines = axes.get_lines()
    assert_true(len(lines) == 1, msg=f"plot has {len(lines)} lines, but should have 1")

    x, y = (np.asarray(data, dtype=float) for data in lines[0].get_data())
    expected_x = np.arange(0, 11)
    assert_true(
        x.shape == expected_x.shape
        and np.allclose(x, expected_x)
        and np.allclose(y, np.exp(expected_x)),
        msg="plot is inaccurate",
    )

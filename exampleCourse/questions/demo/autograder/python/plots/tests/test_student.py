import numpy as np
import pytest
from matplotlib.figure import Figure
from pytest_prairielearn_grader.assertions import assert_plot_equal
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import GradingOutputLevel

# Importing matplotlib in student code can take longer than the default timeout.
sandbox_timeout = 15


def reference_plot() -> Figure:
    figure = Figure()
    axes = figure.subplots()
    x = np.arange(0, 11)
    axes.semilogy(x, np.exp(x))
    return figure


@pytest.mark.output(level=GradingOutputLevel.Friendly)
@pytest.mark.grading_data(name="plot", points=1)
def test_plot(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    plot = sandbox.query("plot")
    if isinstance(plot, Figure):
        feedback.add_image(plot, label="Your plot")
    assert_plot_equal(plot, reference_plot())

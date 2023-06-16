from functools import wraps

import matplotlib.pyplot as plt
from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(1)
    @name("c0")
    def test_0(self):
        score = 0
        if feedback.check_scalar(
            "c0", self.ref.c0, self.st.c0, accuracy_critical=False
        ):
            score = 1
        feedback.set_score(score)

    @points(1)
    @name("c1")
    def test_1(self):
        score = 0
        if feedback.check_scalar(
            "c1", self.ref.c1, self.st.c1, accuracy_critical=False
        ):
            score = 1
        feedback.set_score(score)

    @points(1)
    @name("plot")
    def test_2(self):

        axes = plt.gca()
        score = 0.0

        if len(axes.collections) > 0:

            lines = axes.get_lines()
            collections = axes.collections[:]
            title = axes.get_title()
            xlabel = axes.get_xlabel()
            ylabel = axes.get_ylabel()

            line = (self.ref.data[0], self.ref.c0 + self.ref.c1 * self.ref.data[0])
            data = self.ref.data.T

            # Explicitly convert everything to float
            # to make it work for both floats and ints
            ref_line = (line[0].astype(float), line[1].astype(float))
            ref_data = data.astype(float)

            # Plotting
            if lines or collections:
                # Data points
                if collections:
                    # plt.scatter()
                    data = collections[0].get_offsets()

                    # Explicitly convert everything to float
                    # to make it work for both floats and ints
                    data = data.astype(float)

                    if feedback.check_numpy_array_allclose(
                        "data points",
                        ref_data,
                        data,
                        accuracy_critical=False,
                        report_failure=True,
                    ):
                        score += 0.5
                else:
                    feedback.add_feedback("'plot' is missing the data points")

                # Line of best fit
                if lines:
                    # plt.plot()
                    line = lines[0].get_data()

                    # Explicitly convert everything to float
                    # to make it work for both floats and ints
                    line = (line[0].astype(float), line[1].astype(float))

                    # Check both x and y values
                    if feedback.check_numpy_array_allclose(
                        "line of best fit (x values)",
                        ref_line[0],
                        line[0],
                        accuracy_critical=False,
                        report_success=False,
                        report_failure=True,
                    ) and feedback.check_numpy_array_allclose(
                        "line of best fit (y values)",
                        ref_line[1],
                        line[1],
                        accuracy_critical=False,
                        report_success=False,
                        report_failure=True,
                    ):
                        score += 0.5
                        feedback.add_feedback("'line of best fit' looks good")
                    else:
                        feedback.add_feedback("'line of best fit' is inaccurate")
                else:
                    feedback.add_feedback("'plot' is missing the line of best fit")

            else:
                feedback.add_feedback("'plot' is missing")

        else:
            feedback.add_feedback("'plot' is missing")

        feedback.set_score(min(score, 1.0))

    @not_repeated
    @points(1)
    @wraps(PLTestCaseWithPlot.optional_test_plot_labels)
    def test_9(self):
        self.optional_test_plot_labels()


"""
import numpy as np

# Gather data from plot
"""

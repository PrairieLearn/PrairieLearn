from functools import wraps

from code_feedback import Feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(3)
    @name("calculate_pi")
    def test_0(self):

        points = 0

        user_pi = Feedback.call_user(
            self.st.calculate_pi, self.ref.xs[20:40], self.ref.ys[20:40]
        )
        if Feedback.check_scalar(
            "calculate_pi",
            self.ref.calculate_pi(self.ref.xs[20:40], self.ref.ys[20:40]),
            user_pi,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
        ):
            points += 1
        Feedback.set_score(points)

    @points(3)
    @name("pi")
    def test_1(self):
        points = 0
        if Feedback.check_numpy_array_allclose(
            "pi",
            self.ref.pi,
            self.st.pi,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
        ):
            points += 1
        Feedback.set_score(points)

    @points(3)
    @name("plot")
    def test_2(self):
        points = 0
        if Feedback.check_plot(
            "plot", self.ref.plot, self.st.plot, check_axes_scale="xy"
        ):
            points += 1
        Feedback.set_score(points)

    @not_repeated
    @points(1)
    @wraps(PLTestCaseWithPlot.optional_test_plot_labels)
    def test_9(self):
        self.optional_test_plot_labels()

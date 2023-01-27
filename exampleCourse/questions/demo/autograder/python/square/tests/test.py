from functools import wraps

from code_feedback import Feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCase, PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(10)
    @name("x_sq")
    def test_0(self):
        if Feedback.check_scalar(
            "x_sq", self.ref.x_sq, self.st.x_sq, accuracy_critical=False
        ):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

from functools import wraps

from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCase, PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(2)
    @name("y_est")
    def test_0(self):
        score = 0
        if feedback.check_scalar(
            "y_est", self.ref.y_est, self.st.y_est, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

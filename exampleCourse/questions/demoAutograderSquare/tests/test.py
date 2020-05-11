from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCaseWithPlot, PLTestCase
from code_feedback import Feedback
from functools import wraps


class Test(PLTestCaseWithPlot):
    @points(10)
    @name("x_sq")
    def test_0(self):
        if Feedback.check_scalar('x_sq', self.ref.x_sq, self.st.x_sq, accuracy_critical=False):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

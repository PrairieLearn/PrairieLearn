from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCaseWithPlot, PrairieLearnTestCase
from code_feedback import Feedback as feedback
from functools import wraps


class Test(PrairieLearnTestCaseWithPlot):


    @points(10)
    @name("x_sq")
    def test_0(self):
        points = 0
        if feedback.check_scalar('x_sq', self.ref.x_sq, self.st.x_sq, accuracy_critical=False):
            points += 1
        feedback.set_percent(points)

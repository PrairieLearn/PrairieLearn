from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCaseWithPlot, PrairieLearnTestCase
from code_feedback import Feedback as feedback
from functools import wraps


class Test(PrairieLearnTestCase):
    student_code_file = 'fib.py'
    
    @points(1)
    @name('Check fib(0)')
    def test_zero(self):
        user_val = feedback.call_user(self.st.fib, 0)
        if feedback.check_scalar("fib(0)", 0, user_val):
            feedback.set_points(1)
        else:
            feedback.set_points(0)

    @points(1)
    @name('Check fib(1)')
    def test_one(self):
        user_val = feedback.call_user(self.st.fib, 1)
        if feedback.check_scalar("fib(1)", 1, user_val):
            feedback.set_points(1)
        else:
            feedback.set_points(0)

    @points(3)
    @name('Check fibonacci of an integer > 1')
    def test_integer(self):
        user_val = feedback.call_user(self.st.fib, 7)
        if feedback.check_scalar("fib(1)", 13, user_val):
            feedback.set_points(1)
        else:
            feedback.set_points(0)

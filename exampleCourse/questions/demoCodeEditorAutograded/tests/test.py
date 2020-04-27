from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCaseWithPlot, PrairieLearnTestCase
from code_feedback import Feedback as feedback
from functools import wraps
import numpy as np
import numpy.random


class Test(PrairieLearnTestCase):
    @points(1)
    @name('Check fib(0)')
    def test_0(self):
        user_val = feedback.call_user(self.st.fib, 0)
        if feedback.check_scalar("fib(0)", self.ref.fib(0), user_val):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

    @points(1)
    @name('Check fib(1)')
    def test_1(self):
        user_val = feedback.call_user(self.st.fib, 1)
        if feedback.check_scalar("fib(1)", self.ref.fib(1), user_val):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

    @points(2)
    @name('Check fib(7)')
    def test_2(self):
        user_val = feedback.call_user(self.st.fib, 7)
        if feedback.check_scalar("fib(7)", self.ref.fib(7), user_val):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

    @points(3)
    @name('Check random values')
    def test_3(self):
        points = 0
        num_tests = 10
        test_values = np.random.choice(np.arange(2, 30), size=num_tests, replace=False)
        for in_val in test_values:
            correct_val = self.ref.fib(in_val)
            user_val = feedback.call_user(self.st.fib, in_val)
            if feedback.check_scalar(f"fib({in_val})", correct_val, user_val):
                points += 1
        feedback.set_percent(points / num_tests)

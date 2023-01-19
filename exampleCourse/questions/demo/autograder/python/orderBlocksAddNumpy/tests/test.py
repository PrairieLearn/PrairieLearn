from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCaseWithPlot, PLTestCase
from code_feedback import Feedback
from functools import wraps
import numpy as np


class Test(PLTestCase):
    @points(1)
    @name('Check function my_dot_product')
    def test_0(self):
        points = 0

        a = np.random.rand(4)
        b = np.random.rand(4)

        user_val = Feedback.call_user(self.st.my_dot_product, a, b)
        ref_val = Feedback.call_user(self.ref.my_dot_product, a, b)
        if  Feedback.check_scalar("my_dot_product return value", ref_val, user_val):
            points += 1

        Feedback.set_score(points)

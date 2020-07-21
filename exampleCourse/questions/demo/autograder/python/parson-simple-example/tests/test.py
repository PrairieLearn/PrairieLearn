from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCaseWithPlot, PLTestCase
from code_feedback import Feedback
from functools import wraps


class Test(PLTestCase):
    @points(10)
    @name("Check b")
    def test_0(self):
        user_val = Feedback.call_user(self.st.make_array_b, self.ref.a)
        if Feedback.check_numpy_array_allclose('b', self.ref.b, user_val, accuracy_critical=False):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

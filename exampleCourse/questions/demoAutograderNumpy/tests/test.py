from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCase
from code_feedback import Feedback as feedback

class Test(PrairieLearnTestCase):
    @points(1)
    @name("x")
    def test_0(self):
        if feedback.check_numpy_array_allclose("x", self.ref.x, self.st.x):
            feedback.set_points(1)

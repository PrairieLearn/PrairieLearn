from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCase
from code_feedback import Feedback

class Test(PLTestCase):
    @points(1)
    @name("x")
    def test_0(self):
        if Feedback.check_numpy_array_allclose("x", self.ref.x, self.st.x):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

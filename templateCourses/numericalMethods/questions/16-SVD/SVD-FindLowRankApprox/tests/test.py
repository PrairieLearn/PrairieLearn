from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("Checking A_k")
    def test_1(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "A_k", self.ref.A_k, self.st.A_k, accuracy_critical=False
        ):
            points += 1
        feedback.set_score(points)

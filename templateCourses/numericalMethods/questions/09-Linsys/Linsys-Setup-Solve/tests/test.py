from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(5)
    @name("power_usage")
    def test_0(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "power_usage",
            self.ref.power_usage,
            self.st.power_usage,
            accuracy_critical=False,
        ):
            score = 1
        feedback.set_score(score)

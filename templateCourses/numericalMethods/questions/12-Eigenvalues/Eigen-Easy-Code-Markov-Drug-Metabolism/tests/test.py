from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(2)
    @name("M")
    def test_0(self):
        score = 0

        if self.st.M is None:  # necessary since we take the transpose
            feedback.add_feedback("M is set to None")
            feedback.set_score(0)
            return

        if feedback.check_numpy_array_allclose(
            "M",
            self.ref.M,
            self.st.M.T,
            accuracy_critical=False,
            report_success=False,
            report_failure=False,
        ):
            feedback.add_feedback(
                "Your 'M' is the transpose of the correct transition matrix"
            )
        elif feedback.check_numpy_array_allclose(
            "M", self.ref.M, self.st.M, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

    @points(2)
    @name("hours")
    def test_1(self):
        score = 0
        if feedback.check_scalar(
            "hours", self.ref.hours, self.st.hours, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("correct_results")
    def test_0(self):
        true_output = self.ref.relative_error
        student_output = self.st.relative_error
        feedback.set_score(0)
        if feedback.check_scalar(
            "relative_error",
            self.ref.relative_error,
            self.st.relative_error,
            accuracy_critical=False,
        ):
            feedback.set_score(1)

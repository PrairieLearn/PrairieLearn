from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("correct_results")
    def test_0(self):
        true_outputs = self.ref.outputs
        student_outputs = self.st.outputs
        feedback.set_score(0)
        if not isinstance(student_outputs, list):
            feedback.add_feedback("outputs is not a list")
            return
        if not len(student_outputs) == len(true_outputs):
            feedback.add_feedback(
                f"output is not the correct length: expected length is {len(true_outputs)}, actual length is {len(student_outputs)}"
            )
            return
        tol = 1e-7
        i = 0
        for true_value, student_value in zip(true_outputs, student_outputs):
            if not isinstance(student_value, float):
                feedback.add_feedback(
                    f"Expected a floating point number in outputs, but instead got {type(student_value)}"
                )
                return
            if abs(true_value - student_value) > tol:
                feedback.add_feedback(
                    f"Incorrect value: expected {true_value} but instead got {student_value} at index i = {i}"
                )
                return
            i += 1
        feedback.add_feedback("Everything looks good!")
        feedback.set_score(1)

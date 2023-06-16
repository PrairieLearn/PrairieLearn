from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):

    total_iters = 3

    @points(2)
    @name("data_sum")
    def test_0(self):
        if not isinstance(self.st.data_sum, float):
            feedback.add_feedback("data_sum is not of correct type")
            self.fail()

        simple_sum = sum(self.ref.data)

        simple_err = abs(self.ref.data_sum - simple_sum)
        user_err = abs(self.ref.data_sum - self.st.data_sum)

        if simple_err > user_err:
            feedback.set_score(1)
            feedback.add_feedback("Good job!")
        else:
            feedback.add_feedback(
                "The error of your sum is too large. For a successfull submission make sure your summation approach:\n1) avoids cancellation error due to addition of positive and negative numbers as much as possible\n2) minimizes roundoff error."
            )
            self.fail()

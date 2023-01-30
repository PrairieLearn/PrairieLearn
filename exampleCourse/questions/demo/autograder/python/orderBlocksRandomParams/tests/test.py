from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("Check return value")
    def test_0(self):
        user_val = Feedback.call_user(self.st.return_number)
        if (user_val % 2 == 0) and (self.ref.number_type == "even"):
            Feedback.set_score(1)
            Feedback.add_feedback("Your answer is correct.")
        elif (user_val % 2 != 0) and (self.ref.number_type == "odd"):
            Feedback.set_score(1)
            Feedback.add_feedback("Your answer is correct.")
        else:
            Feedback.set_score(0)
            Feedback.add_feedback("The return value is not correct.")

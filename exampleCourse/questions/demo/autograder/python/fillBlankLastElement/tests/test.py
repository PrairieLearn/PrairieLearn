import random

from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(10)
    @name("last_element")
    def test_0(self):
        num_tests = 10
        score = 0
        for _ in range(num_tests):
            # Generate a random list of integers
            lst = random.sample(range(1000), k=random.randint(1, 20))
            check = lst.copy()
            correct_answer = lst[-1]
            student_answer = Feedback.call_user(self.st.last_element, lst)
            if not Feedback.check_scalar(
                f"last_element({check})", correct_answer, student_answer
            ):
                continue
            if lst != check:
                Feedback.add_feedback(
                    f"Your function modified the input list {check} to {lst}. It should not modify the input list."
                )
                continue
            score += 1
        Feedback.set_score(score / num_tests)

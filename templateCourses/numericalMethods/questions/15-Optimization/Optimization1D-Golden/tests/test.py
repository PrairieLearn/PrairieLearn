from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(2)
    @name("a")
    def test_0(self):
        points = 0
        if feedback.check_scalar("a", self.ref.a, self.st.a, accuracy_critical=False):
            points += 1
        feedback.set_score(points)

    @points(2)
    @name("b")
    def test_1(self):
        points = 0
        if feedback.check_scalar("b", self.ref.b, self.st.b, accuracy_critical=False):
            points += 1
        feedback.set_score(points)

    @points(2)
    @name("evaluation count")
    def test_2(self):
        st_num_evals = self.ref.f.student_eval_count
        num_evals = self.ref.f.total_eval_count - st_num_evals
        diff = num_evals - st_num_evals

        if abs(diff) < 2 or diff == len(self.ref.x):
            # the self.ref.x term is needed because students might not plot
            feedback.add_feedback(
                ("You used the correct number of function " "evaluations.")
            )
            feedback.set_score(1)
        else:
            feedback.add_feedback(
                (
                    "You did not evaluate the function the correct number of "
                    "times. Remember that you can reuse function evaluations in "
                    "Golden Section search."
                )
            )
            self.fail()

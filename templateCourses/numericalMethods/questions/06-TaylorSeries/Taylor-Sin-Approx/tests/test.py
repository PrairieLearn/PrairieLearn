from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(1)
    @name("err_0_1")
    def test_0(self):
        points = 0
        if Feedback.check_scalar(
            "err_0_1", self.ref.err_0_1, self.st.err_0_1, accuracy_critical=False
        ):
            points += 1

        Feedback.set_score(points)

    @points(1)
    @name("err_0_3")
    def test_1(self):
        points = 0
        if Feedback.check_scalar(
            "err_0_3", self.ref.err_0_3, self.st.err_0_3, accuracy_critical=False
        ):
            points += 1

        Feedback.set_score(points)

    @points(1)
    @name("err_pi4_3")
    def test_2(self):
        points = 0
        if Feedback.check_scalar(
            "err_pi4_3", self.ref.err_pi4_3, self.st.err_pi4_3, accuracy_critical=False
        ):
            points += 1

        Feedback.set_score(points)

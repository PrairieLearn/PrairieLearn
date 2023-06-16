from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(2)
    @name("root")
    def test_0(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "root", self.ref.root, self.st.root, accuracy_critical=False
        ):
            points = 1
        feedback.set_score(points)

    @points(2)
    @name("res")
    def test_1(self):
        points = 0
        if feedback.check_scalar("res", self.ref.res, self.st.res):
            points = 1
        feedback.set_score(points)

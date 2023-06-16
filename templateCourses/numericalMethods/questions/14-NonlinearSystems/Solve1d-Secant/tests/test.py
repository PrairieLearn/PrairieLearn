from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(3)
    @name("roots")
    def test_0(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "roots", self.ref.roots, self.st.roots, accuracy_critical=False
        ):
            points = 1
        feedback.set_score(points)

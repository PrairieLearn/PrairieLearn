from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCase, PLTestCaseWithPlot
from code_feedback import Feedback

class Test(PLTestCaseWithPlot):
    @points(1)
    @name("plot")
    def test_0(self):
        if Feedback.check_plot('plot', self.ref.plot, self.st.plot, check_axes_scale='xy'):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

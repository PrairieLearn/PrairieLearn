from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCase, PrairieLearnTestCaseWithPlot
from code_feedback import Feedback as feedback

class Test(PrairieLearnTestCaseWithPlot):
    @points(1)
    @name("plot")
    def test_0(self):
        if feedback.check_plot('plot', self.ref.plot, self.st.plot, check_axes_scale='xy'):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

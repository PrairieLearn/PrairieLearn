from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCase
from code_feedback import Feedback as feedback

class Test(PrairieLearnTestCase):
    @points(1)
    @name("area")
    def test_0(self):
        if feedback.check_scalar("area", self.ref.area, self.st.area):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

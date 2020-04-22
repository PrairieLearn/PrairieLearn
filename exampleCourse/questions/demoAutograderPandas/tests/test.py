from pl_helpers import name, points, not_repeated
from pl_unit_test import PrairieLearnTestCase
from code_feedback import Feedback as feedback

class Test(PrairieLearnTestCase):
    @points(1)
    @name("df")
    def test_0(self):
        if feedback.check_dataframe("df", self.ref.df, self.st.df, display_input=True):
            feedback.set_percent(1)
        else:
            feedback.set_percent(0)

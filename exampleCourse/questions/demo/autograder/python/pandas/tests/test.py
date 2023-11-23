from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("df")
    def test_0(self):
        if Feedback.check_dataframe("df", self.ref.df, self.st.df, display_input=True):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

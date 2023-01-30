from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("y")
    def test_0(self):
        if Feedback.check_scalar("y", self.ref.y, self.st.y, accuracy_critical=True):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

    @points(1)
    @name("z")
    def test_1(self):
        if Feedback.check_scalar("z", self.ref.z, self.st.z, accuracy_critical=True):
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)

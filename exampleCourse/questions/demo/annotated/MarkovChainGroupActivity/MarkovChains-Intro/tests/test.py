from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCase
from code_feedback import Feedback
import numpy as np

def convert_to_float_array(array):
    if type(array) is np.ndarray:
        converted = array.astype(float)
    else:
        converted = array
    return converted


class Test(PLTestCase):

    student_code_file = 'Markov-Chains-1.ipynb'

    @points(1)
    @name("Testing function power_iteration")
    def test_0(self):
        points = 0
        # use the same input vector for both u and v to avoid ambiguity in the order of iteration
        results = Feedback.call_user(
            self.st.power_iteration, self.ref.M_test, self.ref.x_test)
        if results is None:
            Feedback.add_feedback(
                'Your function is not returning any variables.')
            self.fail()
        if Feedback.check_numpy_array_allclose('The return value from your function power_iteration', self.ref.xc, results):
            points += 0.5
        results_hidden = Feedback.call_user(
            self.st.power_iteration, self.ref.M_hidden, self.ref.x_hidden)
        if Feedback.check_numpy_array_allclose('The return value from your function power_iteration (hidden test case)', self.ref.xc_hidden, results_hidden):
            points += 0.5
        Feedback.set_score(points)

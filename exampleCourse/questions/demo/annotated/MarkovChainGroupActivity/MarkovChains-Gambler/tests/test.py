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

    student_code_file = 'Markov-Chains-2.ipynb'


    @points(1)
    @name("Testing Gambler Markov Matrix G")
    def test_1(self):
        points = 0
        if Feedback.check_numpy_array_allclose('G', self.ref.G, self.st.G):
            points += 1
        Feedback.set_score(points)

    @points(1)
    @name("Testing probability of winning and losing xstar2")
    def test_2(self):
        points = 0
        xstar2 = convert_to_float_array(self.st.xstar2)
        if Feedback.check_numpy_array_allclose('xstar2', self.ref.xstar2, xstar2):
            points += 1
        Feedback.set_score(points)

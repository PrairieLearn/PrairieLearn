from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCase
from code_feedback import Feedback
import numpy as np

class Test(PLTestCase):

    student_code_file = 'Markov-Chains-3.ipynb'

    @points(1)
    @name("Testing PageRank Markov Matrix M2")
    def test_3(self):
        points = 0
        if Feedback.check_numpy_array_allclose('M2', self.ref.M2, self.st.M2):
                points += 1
        Feedback.set_score(points)

    @points(1)
    @name("Testing larger example Markov Matrix M3")
    def test_4(self):
        points = 0
        if Feedback.check_numpy_array_allclose('M3', self.ref.M3, self.st.M3):
                points += 1
        Feedback.set_score(points)

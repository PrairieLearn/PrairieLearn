import math
from functools import wraps

import numpy as np
import numpy.linalg as la
from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCase, PLTestCaseWithPlot


class Test(PLTestCase):
    @points(1)
    @name("Checking A_k")
    def test_1(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "A_k", self.ref.A_k, self.st.A_k, accuracy_critical=False
        ):
            points += 1
        feedback.set_score(points)

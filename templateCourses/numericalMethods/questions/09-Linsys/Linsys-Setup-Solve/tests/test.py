from functools import wraps

import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCase, PLTestCaseWithPlot


class Test(PLTestCase):
    @points(5)
    @name("power_usage")
    def test_0(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "power_usage",
            self.ref.power_usage,
            self.st.power_usage,
            accuracy_critical=False,
        ):
            score = 1
        feedback.set_score(score)

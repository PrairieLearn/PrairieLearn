import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("Checking function dfunc")
    def test_0(self):
        points = 0
        x = self.ref.x
        ref_dfunc_vals = self.ref.dfunc(x)
        st_dfunc_vals = np.zeros_like(x)
        for idx in range(x.shape[0]):
            st_dfunc_vals[idx] = feedback.call_user(self.st.dfunc, x[idx])
        if feedback.check_numpy_array_allclose(
            "dfunc", ref_dfunc_vals, st_dfunc_vals, accuracy_critical=False
        ):
            points = 1

        feedback.set_score(points)

    @points(1)
    @name("Checking function d2func")
    def test_1(self):
        points = 0
        x = self.ref.x
        ref_d2func_vals = self.ref.d2func(x)
        st_d2func_vals = np.zeros_like(x)
        for idx in range(x.shape[0]):
            st_d2func_vals[idx] = feedback.call_user(self.st.d2func, x[idx])
        if feedback.check_numpy_array_allclose(
            "dfunc", ref_d2func_vals, st_d2func_vals, accuracy_critical=False
        ):
            points = 1

        feedback.set_score(points)

    @points(1)
    @name("Checking newton_guesses")
    def test_2(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "newton_guesses",
            self.ref.newton_guesses,
            self.st.newton_guesses,
            accuracy_critical=False,
        ):
            points = 1

        feedback.set_score(points)

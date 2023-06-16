from functools import wraps

import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    total_iters = 2

    @points(1)
    @name("Test func")
    def test_0(self):
        score = 0
        xvec = 1e5 * np.random.random_integers(50, 150, size=2) * 10.0
        func_val = feedback.call_user(self.st.func, xvec)
        ref_func_val = self.ref.func(xvec)
        if feedback.check_scalar(
            "func", ref_func_val, func_val, accuracy_critical=False
        ):
            score = 1
        feedback.set_score(score)

    @points(1)
    @name("Test dfunc")
    def test_1(self):
        score = 0
        xvec = 1e5 * np.random.random_integers(50, 150, size=2) * 10.0
        df_exact = feedback.call_user(self.st.dfunc, xvec)
        ref_df_exact = self.ref.dfunc(xvec)
        if feedback.check_numpy_array_allclose(
            "dfunc", ref_df_exact, df_exact, accuracy_critical=False
        ):
            score = 1
        feedback.set_score(score)

    @points(1)
    @name("Test fd")
    def test_2(self):
        score = 0
        xvec = 1e5 * np.random.random_integers(50, 150, size=2) * 10.0
        dx = 1e-2
        fd_exact = feedback.call_user(self.st.fd, np.copy(xvec), dx)
        ref_fd_exact = self.ref.fd(np.copy(xvec), dx)
        if feedback.check_numpy_array_allclose(
            "fd", ref_fd_exact, fd_exact, accuracy_critical=False
        ):
            score = 1
        feedback.set_score(score)

    @points(1.5)
    @name("Test error")
    def test_3(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "error", self.ref.error, self.st.error, rtol=1e-2, atol=1e-5
        ):
            score = 1
        feedback.set_score(score)

    @not_repeated
    @points(1)
    @wraps(PLTestCaseWithPlot.optional_test_plot_labels)
    def test_4(self):
        self.optional_test_plot_labels()

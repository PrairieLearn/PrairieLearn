import numpy as np
from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(1)
    @name("gradient_descent()")
    def test_0(self):
        tests = 50
        points = 0

        xs = np.linspace(-1, 1, tests)
        alphas = np.linspace(0.1, 0.001, tests)
        np.random.shuffle(xs)
        np.random.shuffle(alphas)

        for i in range(tests):
            x = xs[i]
            alpha = alphas[i]
            ref_xnew = self.ref.gradient_descent(x, alpha)
            st_xnew = Feedback.call_user(self.st.gradient_descent, x, alpha)
            if Feedback.check_scalar(
                f"x={x}, alpha={alpha}",
                ref_xnew,
                st_xnew,
                report_success=True,
                report_failure=True,
            ):
                points += 1
        Feedback.set_score(points / tests)

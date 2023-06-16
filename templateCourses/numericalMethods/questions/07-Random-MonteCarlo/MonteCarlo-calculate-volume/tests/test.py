import random

import numpy as np
from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(1)
    @name("Check function insideCylinders")
    def test_0(self):
        points = 0
        origin = np.array([0.0, 0.0, 0.0])
        border = np.array([0.0, 1.0, 0.0])
        outside = np.array([2.0, 0.0, 0.0])

        f = self.st.insideCylinders
        if Feedback.call_user(f, origin, 1):
            points += 1
        else:
            Feedback.add_feedback(
                "Your function does not give the correct output for a point inside the solid."
            )

        if Feedback.call_user(f, border, 1):
            points += 1
        else:
            Feedback.add_feedback(
                "Your function does not give the correct output for a point on the edge of the solid."
            )

        if not Feedback.call_user(f, outside, 1):
            points += 1
        else:
            Feedback.add_feedback(
                "Your function does not give the correct output for a point outside the solid."
            )

        if points == 3:
            Feedback.add_feedback("Your function looks good for r = 1!")
            r = 3
            x = random.uniform(-r, r)
            y = random.uniform(-r, r)
            z = random.uniform(-r, r)
            pos = np.array([x, y, z])
            N = 500
            ref = self.ref.insideCylinders(pos, r)
            st = Feedback.call_user(self.st.insideCylinders, pos, r)
            if ref == st:
                Feedback.add_feedback(
                    "And your function also looks good for other values of r!"
                )
                Feedback.set_score(1)
            else:
                Feedback.add_feedback(
                    "But your function does not look good for other values of r!"
                )
                Feedback.set_score(0)
        else:
            Feedback.set_score(0)

        # Feedback.set_score(points / 3.0)

    @points(1)
    @name("Check function prob_inside_volume")
    def test_1(self):
        points = 0.0
        seed = np.random.randint(1000)
        vals = [10, 100, 1000, 10000]
        r = 1
        for N in vals:
            np.random.seed(seed)
            st = Feedback.call_user(self.st.prob_inside_volume, N, r)
            np.random.seed(seed)
            ref = self.ref.prob_inside_volume(N, r)
            if Feedback.check_scalar(f"N = {N}", ref, st, rtol=0.1):
                points += 1

        Feedback.set_score(points / len(vals))

    @points(1)
    @name("Check volume_approx")
    def test_2(self):
        points = 0
        N = 1000
        if self.st.volume_approx is not None:
            if self.st.volume_approx == (16.0 / 3):
                # setting directly equal to 16/3 is bad
                # I guess they could do (16/3 + dx) for some small dx but oh well
                Feedback.add_feedback(
                    "'volume_approx' is inaccurate. It looks like you are storing the exact value. Use the return value of your function instead"
                )
            else:
                if np.abs(self.st.volume_approx - (16.0 / 3)) < 0.2:
                    points = 1
                else:
                    Feedback.add_feedback("'volume_approx' is inaccurate.")
            Feedback.set_score(points)
        else:
            Feedback.add_feedback(" 'volume_approx' is not defined ")
            Feedback.set_score(0)

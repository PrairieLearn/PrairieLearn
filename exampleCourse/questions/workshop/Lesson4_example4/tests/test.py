import numpy as np
from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(1)
    @name("Check b")
    def test_0(self):
        points = 0

        Feedback.check_numpy_array_features(
            "b", self.ref.a, self.st.b, accuracy_critical=True
        )

        suma = self.ref.beta * np.sum(self.ref.a)
        sumb = np.sum(self.st.b)

        if Feedback.check_scalar("b", suma, sumb):
            points += 1

        Feedback.set_score(points)

    @points(2)
    @name("Check function ")
    def test_1(self):
        points = 0
        results = Feedback.call_user(self.st.array_to_scalar, self.ref.a1, self.ref.a2)
        # Testing if the return values are given correctly
        if results is not None:
            if hasattr(results, "__len__"):
                if len(results) != 2:
                    Feedback.add_feedback(
                        "Your function is not returning the correct number of variables"
                    )
                    self.fail()
                else:
                    (st_c, st_sumc) = results
            else:
                Feedback.add_feedback(
                    "The return variables do not appear to be in tuple format"
                )
                self.fail()
        else:
            Feedback.add_feedback("Your function is not returning any variables.")
            self.fail()

        if Feedback.check_numpy_array_allclose(
            "c", self.ref.c, st_c, accuracy_critical=False
        ):
            points += 0.5

        if Feedback.check_scalar(
            "sum_c", self.ref.sum_c, st_sumc, accuracy_critical=True
        ):
            points += 0.5

        Feedback.set_score(points)

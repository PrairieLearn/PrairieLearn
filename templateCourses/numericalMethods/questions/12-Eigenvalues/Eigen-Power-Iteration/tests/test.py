from functools import wraps

import numpy as np
import numpy.linalg as la
import scipy.linalg as spla
from code_feedback import Feedback as feedback
from pl_helpers import name, not_repeated, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):

    # for name, data, shape in [
    # ("eigenval1", eigenval1, (n,) ),
    # ("eigenval2", eigenval2, (n,) ),
    # ("eigenvec1", eigenvec1, (n,2) ),
    # ("eigenvec2", eigenvec2, (n,2) ),
    # ("cnt", cnt, (n,) )
    # ]:

    @points(1)
    @name("eigenval1")
    def test_0(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "eigenval1", self.ref.eigenval1, self.st.eigenval1, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

    @points(1)
    @name("eigenval2")
    def test_1(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "eigenval2", self.ref.eigenval2, self.st.eigenval2, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

    @points(1)
    @name("shifted_eigval")
    def test_1(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "shifted_eigval",
            self.ref.shifted_eigval,
            self.st.shifted_eigval,
            accuracy_critical=False,
        ):
            score += 1.0
        feedback.set_score(score)

    @points(1)
    @name("eigenvec1")
    def test_2(self):
        score = 0
        if not feedback.check_numpy_array_features(
            "eigenvec1", self.ref.eigenvec1, self.st.eigenvec1, accuracy_critical=False
        ):
            feedback.set_score(0)
            return
        if not feedback.check_numpy_array_features(
            "eigenval1", self.ref.eigenval1, self.st.eigenval1, accuracy_critical=False
        ):
            feedback.set_score(0)
            return

        for i in range(self.ref.n):
            if abs(la.norm(self.st.eigenvec1[i]) - 1) > 1e-7:
                feedback.add_feedback("eigenvec1[%i] does not have norm 1" % i)
            elif not np.allclose(
                self.ref.As[i].dot(self.st.eigenvec1[i]),
                self.st.eigenval1[i] * self.st.eigenvec1[i],
            ):
                feedback.add_feedback("eigenvec1[%i] is not a valid eigenvector" % i)
            else:
                score += 1.000001 / self.ref.n
        feedback.set_score(min(score, 1.0))

    @points(1)
    @name("eigenvec2")
    def test_3(self):
        score = 0
        if not feedback.check_numpy_array_features(
            "eigenvec2", self.ref.eigenvec2, self.st.eigenvec2, accuracy_critical=False
        ):
            feedback.set_score(0)
            return
        if not feedback.check_numpy_array_features(
            "eigenval2", self.ref.eigenval2, self.st.eigenval2, accuracy_critical=False
        ):
            feedback.set_score(0)
            return

        for i in range(self.ref.n):
            if abs(la.norm(self.st.eigenvec2[i]) - 1) > 1e-7:
                feedback.add_feedback("eigenvec2[%i] does not have norm 1" % i)
            elif not np.allclose(
                self.ref.As[i].dot(self.st.eigenvec2[i]),
                self.st.eigenval2[i] * self.st.eigenvec2[i],
            ):
                feedback.add_feedback("eigenvec2[%i] is not a valid eigenvector" % i)
            else:
                score += 1.000001 / self.ref.n
        feedback.set_score(min(score, 1.0))

    @points(1)
    @name("shifted_eigvec")
    def test_3(self):
        score = 0
        if not feedback.check_numpy_array_features(
            "shifted_eigvec",
            self.ref.shifted_eigvec,
            self.st.shifted_eigvec,
            accuracy_critical=False,
        ):
            feedback.set_score(0)
            return
        if not feedback.check_numpy_array_features(
            "shifted_eigval",
            self.ref.shifted_eigval,
            self.st.shifted_eigval,
            accuracy_critical=False,
        ):
            feedback.set_score(0)
            return

        for i in range(self.ref.n):
            if abs(la.norm(self.st.shifted_eigvec[i]) - 1) > 1e-7:
                feedback.add_feedback("shifted_eigvec[%i] does not have norm 1" % i)
            elif not np.allclose(
                (self.ref.As[i] - np.eye(self.ref.As[i].shape[0])).dot(
                    self.st.shifted_eigvec[i]
                ),
                (self.st.shifted_eigval[i] - 1) * self.st.shifted_eigvec[i],
            ):
                feedback.add_feedback(
                    "shifted_eigvec[%i] is not a valid eigenvector" % i
                )
            else:
                score += 1.000001 / self.ref.n
        feedback.set_score(min(score, 1.0))

    @points(1)
    @name("cnt")
    def test_4(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "cnt", self.ref.cnt, self.st.cnt, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

    @points(1)
    @name("efficiency")
    def test_5(self):
        if spla.lu.count > 4 * self.ref.n:
            feedback.add_feedback(
                "Your solve method is not efficient. Think about the reasons why we decouple the LU factorization and the solve functions."
            )
            feedback.set_score(0)
            return
        feedback.set_score(1)

    @points(1)
    @name("ratios")
    def test_6(self):
        score = 0
        if feedback.check_numpy_array_allclose(
            "ratios", self.ref.ratios, self.st.ratios, accuracy_critical=False
        ):
            score += 1.0
        feedback.set_score(score)

    @not_repeated
    @points(1)
    @wraps(PLTestCaseWithPlot.optional_test_plot_labels)
    def test_7(self):
        self.optional_test_plot_labels()

import matplotlib._pylab_helpers
import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    def line_match(self, data, ref_lines, matched):
        for i, ref_line in enumerate(ref_lines):
            if i in matched:
                continue
            data_ref = np.array([ref_line.get_data()[0], ref_line.get_data()[1]])
            data_ref = data_ref[np.lexsort(data_ref.T)]
            try:
                if np.allclose(data, data_ref, rtol=1e-3, atol=0.001):
                    matched.append(i)
                    return 1.0, matched
            except TypeError:
                return 0, matched

        return 0, matched

    def grade_figure(self, i, f, ref_f):
        lines = f.get_lines()
        ref_lines = ref_f.get_lines()

        graph_grade = 0
        data = None
        matched = []
        if lines:
            if len(lines) > 1:
                feedback.add_feedback(
                    "You have plotted more than 1 line on 'Figure {}'".format(i + 1)
                )
                return graph_grade, 10
            for line in lines:
                # Can't grade if plot uses different number of points

                data = np.array([line.get_data()[0], line.get_data()[1]])
                if np.shape(data) != (2, 500):
                    feedback.add_feedback(
                        "Please use 500 points for each line to plot 'Figure {}'".format(
                            i + 1
                        )
                    )
                    return graph_grade, 10
                else:
                    data = data[np.lexsort(data.T)]
                    grade, matched = self.line_match(data, ref_lines, matched)
                    graph_grade += grade
        else:
            cs = f.collections
            if cs:
                # plt.scatter()
                if len(cs) > 1:
                    feedback.add_feedback(
                        "You have plotted more than 1 line on 'Figure {}'".format(i + 1)
                    )
                    return graph_grade, 10
                for c in cs:
                    data = np.array([c.get_offsets()[:, 0], c.get_offsets()[:, 1]])
                    if np.shape(data) != (2, 500):
                        feedback.add_feedback(
                            "Please use 500 points for each line to plot 'Figure {}'".format(
                                i + 1
                            )
                        )
                        return graph_grade, 10
                    else:
                        data = data[np.lexsort(data.T)]
                        grade, matched = self.line_match(data, ref_lines, matched)
                        graph_grade += grade

        wrong_lines = 1 - len(matched)

        if graph_grade == 0.125:
            feedback.add_feedback("'Figure {}' looks good".format(i + 1))
        # else:
        #    feedback.add_feedback("'Figure {}' is not correct, you have {} lines wrong".format(i+1, wrong_lines))
        return graph_grade, wrong_lines

    @points(1)
    @name("fig1")
    def test_1(self):

        score = 0
        if self.st.fig_1 is not None:
            if isinstance(self.st.fig_1, matplotlib.axes.Subplot):
                feedback1, wrong_lines = self.grade_figure(
                    0, self.st.fig_1, self.ref.fig_1
                )
                score += feedback1
                if wrong_lines > 0 and wrong_lines != 10:
                    feedback.add_feedback(
                        "'Figure {}' is not correct, you have {} lines wrong".format(
                            1, wrong_lines
                        )
                    )
            else:
                feedback.add_feedback(
                    "Please use `plt.gca()` to save plot to variable 'fig_1'"
                )
        else:
            feedback.add_feedback(
                "'fig_1' is None, please use `plt.gca()` to save plot to variable 'fig_1'"
            )
        feedback.set_score(score)

    @points(1)
    @name("fig2")
    def test_2(self):

        score = 0
        if self.st.fig_2 is not None:
            if isinstance(self.st.fig_2, matplotlib.axes.Subplot):
                feedback1, wrong_lines = self.grade_figure(
                    1, self.st.fig_2, self.ref.fig_2
                )
                score += feedback1
                if wrong_lines > 0 and wrong_lines != 10:
                    feedback.add_feedback(
                        "'Figure {}' is not correct, you have {} lines wrong".format(
                            2, wrong_lines
                        )
                    )
            else:
                feedback.add_feedback(
                    "Please use `plt.gca()` to save plot to variable 'fig_2'"
                )
        else:
            feedback.add_feedback(
                "'fig_2' is None, please use `plt.gca()` to save plot to variable 'fig_2'"
            )
        feedback.set_score(score)

    @points(1)
    @name("fig3")
    def test_3(self):
        score = 0

        if self.st.fig_3 is not None:
            if isinstance(self.st.fig_3, matplotlib.axes.Subplot):
                feedback1, wrong_lines = self.grade_figure(
                    2, self.st.fig_3, self.ref.fig_3
                )
                score += feedback1
                if wrong_lines > 0 and wrong_lines != 10:
                    feedback.add_feedback(
                        "'Figure {}' is not correct, you have {} lines wrong".format(
                            3, wrong_lines
                        )
                    )
            else:
                feedback.add_feedback(
                    "Please use `plt.gca()` to save plot to variable 'fig_3'"
                )
        else:
            feedback.add_feedback(
                "'fig_3' is None, please use `plt.gca()` to save plot to variable 'fig_3'"
            )
        feedback.set_score(score)

    @points(1)
    @name("fig4")
    def test_4(self):
        score = 0
        if self.st.fig_4 is not None:
            if isinstance(self.st.fig_4, matplotlib.axes.Subplot):
                feedback1, wrong_lines = self.grade_figure(
                    3, self.st.fig_4, self.ref.fig_4
                )
                score += feedback1
                if wrong_lines > 0 and wrong_lines != 10:
                    feedback.add_feedback(
                        "'Figure {}' is not correct, you have {} lines wrong".format(
                            4, wrong_lines
                        )
                    )
            else:
                feedback.add_feedback(
                    "Please use `plt.gca()` to save plot to variable 'fig_4'"
                )

        else:
            feedback.add_feedback(
                "'fig_4' is None, please use `plt.gca()` to save plot to variable 'fig_4'"
            )

        feedback.set_score(score)

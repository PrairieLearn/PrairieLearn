import matplotlib.pyplot as plt
import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCaseWithPlot


class Test(PLTestCaseWithPlot):
    @points(1)
    @name("r_sd")
    def test_0(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "r_sd",
            self.ref.r_sd,
            self.st.r_sd,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
            rtol=1e-3,
        ):
            points += 1
        feedback.set_score(points)

    @points(1)
    @name("r_newton")
    def test_1(self):
        points = 0
        if feedback.check_numpy_array_allclose(
            "r_newton",
            self.ref.r_newton,
            self.st.r_newton,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
            rtol=1e-3,
        ):
            points += 1
        feedback.set_score(points)

    @points(1)
    @name("iteration_count_newton")
    def test_2(self):
        points = 0
        if feedback.check_scalar(
            "iteration_count_newton",
            self.ref.iteration_count_newton,
            self.st.iteration_count_newton,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
        ):
            points += 1
        feedback.set_score(points)

    @points(1)
    @name("iteration_count_sd")
    def test_3(self):
        points = 0
        if feedback.check_scalar(
            "iteration_count_sd",
            self.ref.iteration_count_sd,
            self.st.iteration_count_sd,
            accuracy_critical=False,
            report_success=True,
            report_failure=True,
        ):
            points += 1
        feedback.set_score(points)

    @points(2)
    @name("plot")
    def test_4(self):
        axes = plt.gca()
        lines = axes.get_lines()
        # title = axes.get_title()
        # xlabel = axes.get_xlabel()
        # ylabel = axes.get_ylabel()
        # legend = axes.get_legend()
        plot_score = 0.0

        # class Ref():
        #     # Correct Code copy-pasted since diff_sd is needed for grading plot
        #     def __init__(self,r_init,stop):
        #         import numpy.linalg as la
        #         import numpy as np
        #         import scipy.optimize as opt
        #         def f(x):
        #             return 3+x[0]**2/8+x[1]**2/8-np.sin(x[0])*np.cos(2**-0.5*x[1])

        #         def obj_func(alpha, x, s):
        #             f_of_x_plus_alpha_s = f(x + alpha * s)
        #             return f_of_x_plus_alpha_s

        #         def gradient(r):
        #             x, y = r
        #             g1 = 0.25*x - np.cos(x)*np.cos((np.sqrt(2)/2)*y)
        #             g2 = 0.25*y + np.sin(x)*(np.sqrt(2)/2)*np.sin((np.sqrt(2)/2)*y)
        #             return np.array([g1,g2])

        #         def steepest_descent(x_init, stop):
        #             x_values = [x_init]
        #             x_new = x_init
        #             x_prev = x_init+stop+30
        #             iteration_count = 0
        #             while(la.norm(gradient(x_new)) >= stop):
        #                 x_prev = x_new
        #                 s = -gradient(x_prev)
        #                 alpha = opt.minimize_scalar(obj_func, args=(x_prev, s)).x
        #                 x_new = x_prev + alpha*s
        #                 x_values.append(x_new)
        #                 iteration_count += 1
        #             x_values = np.array(x_values)
        #             return x_new, iteration_count, x_values

        #         def hessian(r):
        #             # Computes the hessian matrix corresponding to the given objective function
        #             x, y = r
        #             h1 = 0.25+np.sin(x)*np.cos((np.sqrt(2)/2)*y)
        #             h2 = 0.25+np.sin(x)*np.cos((np.sqrt(2)/2)*y)*(np.sqrt(2)/2)*(np.sqrt(2)/2)

        #             h12 = np.sin((np.sqrt(2)/2)*y)*np.cos(x)*(np.sqrt(2)/2)
        #             h21 = np.sin((np.sqrt(2)/2)*y)*np.cos(x)*(np.sqrt(2)/2)
        #             return np.array([[h1,h12],[h21,h2]])

        #         def newtons_method(x_init, stop):
        #             x_values = [x_init]
        #             x_new = x_init
        #             x_prev = x_init+stop+30
        #             iteration_count = 0
        #             while(la.norm(gradient(x_new)) >= stop):
        #                 x_prev = x_new
        #                 s = -la.solve(hessian(x_prev), gradient(x_prev))
        #                 x_new = x_prev + s
        #                 x_values.append(x_new)
        #                 iteration_count += 1
        #             x_values = np.array(x_values)
        #             return x_new, iteration_count, x_values

        #         r_sd, iteration_count_sd, val_sd = steepest_descent(r_init, stop)
        #         r_newton, iteration_count_newton, val_newton = newtons_method(r_init, stop)

        #         # Get 2-norm of error for each iteration result of both methods
        #         diff_sd = la.norm(val_sd - r_sd, axis = 1)
        #         diff_newton = la.norm(val_newton - r_newton, axis = 1)

        #         # We remove the last point, since we don't want to compute the log of zero
        #         diff_sd = np.log(diff_sd[:-1])
        #         diff_newton = np.log(diff_newton[:-1])

        #         self.diff_sd = diff_sd
        #         self.diff_newton = diff_newton
        #         self.x_sd = np.array(range(iteration_count_sd), dtype = "float64")
        #         self.x_newton = np.array(range(iteration_count_newton), dtype = "float64")

        # ref = Ref(self.ref.r_init,self.ref.stop)

        if lines:

            # Define x-axis of the plot
            x_axis_sd = np.array(self.ref.x_axis_sd, dtype="float64")
            x_axis_newton = np.array(self.ref.x_axis_newton, dtype="float64")

            if len(lines) == 2:
                line0 = lines[0].get_data()
                line0 = (line0[0].astype(float), line0[1].astype(float))
                line1 = lines[1].get_data()
                line1 = (line1[0].astype(float), line1[1].astype(float))

                # Check steepest_descent line first
                if line0[0].shape[0] < line1[0].shape[0]:
                    line0, line1 = line1, line0

                if feedback.check_numpy_array_allclose(
                    "Steepest descent line (x values)",
                    x_axis_sd,
                    line0[0],
                    accuracy_critical=False,
                    report_success=False,
                    report_failure=True,
                    rtol=1e-3,
                ) and feedback.check_numpy_array_allclose(
                    "Steepest descent line (y values)",
                    self.ref.diff_sd,
                    line0[1],
                    accuracy_critical=False,
                    report_success=False,
                    report_failure=True,
                    rtol=1e-3,
                ):
                    plot_score += 0.5
                    feedback.add_feedback("'Steepest descent line' looks good")
                else:
                    feedback.add_feedback("'Steepest descent line' is inaccurate")

                if feedback.check_numpy_array_allclose(
                    "Newton method line (x values)",
                    x_axis_newton,
                    line1[0],
                    accuracy_critical=False,
                    report_success=False,
                    report_failure=True,
                    rtol=1e-3,
                ) and feedback.check_numpy_array_allclose(
                    "Newton method line (y values)",
                    self.ref.diff_newton,
                    line1[1],
                    accuracy_critical=False,
                    report_success=False,
                    report_failure=True,
                    rtol=1e-3,
                ):
                    plot_score += 0.5
                    feedback.add_feedback("'Newton method line' looks good")
                else:
                    feedback.add_feedback("'Newton method line' is inaccurate")

            else:
                feedback.add_feedback("The number of lines is not correct")

            # if title:
            #     plot_score += 0.06
            # else:
            #     feedback.add_feedback("'plot' is missing a title")

            # if legend:
            #     plot_score += 0.05
            # else:
            #     feedback.add_feedback("'plot' is missing a legend")

            # if xlabel:
            #     plot_score += 0.05
            # else:
            #     feedback.add_feedback("'plot' is missing a xlabel")

            # if ylabel:
            #     plot_score += 0.05
            # else:
            #     feedback.add_feedback("'plot' is missing a ylabel")
        else:
            feedback.add_feedback("'plot' is missing")

        feedback.set_score(min(1.0, plot_score))

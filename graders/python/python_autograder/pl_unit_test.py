import json
import os
import unittest
from collections import namedtuple
from os.path import join
from types import ModuleType

# Needed to ensure matplotlib runs on Docker
import matplotlib as mpl
from code_feedback import Feedback
from pl_execute import execute_code
from pl_helpers import GradingSkipped, name, save_plot
from pl_result import PLTestResult

mpl.use("Agg")


class PLTestCase(unittest.TestCase):
    """
    Base class for test suites, using the Python unittest library.
    Handles automatic setup and teardown of testing logic.

    Methods here do not need to be overridden by test suites.
    """

    include_plt = False
    student_code_file = "user_code.py"
    iter_num = 0
    total_iters = 1
    ipynb_key = "#grade"
    plt: ModuleType | None

    @classmethod
    def setUpClass(cls) -> None:
        """
        On start, run the user code and generate answer tuples.
        """
        Feedback.set_test(cls)
        base_dir = os.environ.get("MERGE_DIR")
        if base_dir is None:
            raise ValueError("MERGE_DIR not set in environment variables")

        filenames_dir = os.environ.get("FILENAMES_DIR")
        if filenames_dir is None:
            raise ValueError("FILENAMES_DIR not set in environment variables")

        cls.student_code_abs_path = join(base_dir, cls.student_code_file)

        # Load data so that we can use it in the test cases
        with open(join(filenames_dir, "data.json"), encoding="utf-8") as f:
            cls.data = json.load(f)

        ref_result, student_result, plot_value = execute_code(
            join(filenames_dir, "ans.py"),
            join(base_dir, cls.student_code_file),
            cls.include_plt,
            join(base_dir, "output.txt"),
            cls.iter_num,
            cls.ipynb_key,
        )
        answerTuple = namedtuple("answerTuple", ref_result.keys())  # noqa: PYI024
        cls.ref = answerTuple(**ref_result)
        studentTuple = namedtuple("studentTuple", student_result.keys())  # noqa: PYI024
        cls.st = studentTuple(**student_result)
        cls.plt = plot_value
        if cls.include_plt:
            cls.display_plot()

    @classmethod
    def tearDownClass(cls) -> None:
        """
        Close all plots and increment the iteration number on test finish
        """

        if cls.include_plt and cls.plt:
            cls.plt.close("all")
        cls.iter_num += 1

    @classmethod
    def display_plot(cls) -> None:
        if not cls.plt:
            raise ValueError("No plot to display")
        axes = cls.plt.gca()
        if axes.get_lines() or axes.collections or axes.patches or axes.images:
            save_plot(cls.plt, cls.iter_num)

    @classmethod
    def get_total_points(cls) -> float:
        """
        Get the total number of points awarded by this test suite, including
        cases where the test suite is run multiple times.
        """

        methods = [
            y
            for x, y in cls.__dict__.items()
            if callable(y)
            and hasattr(y, "__dict__")
            and x.startswith("test_")
            and "points" in y.__dict__
        ]
        if cls.total_iters == 1:
            total = sum([m.__dict__["points"] for m in methods])
        else:
            once = sum([
                m.__dict__["points"]
                for m in methods
                if not m.__dict__.get("__repeated__", True)
            ])
            several = sum([
                m.__dict__["points"]
                for m in methods
                if m.__dict__.get("__repeated__", True)
            ])
            total = cls.total_iters * several + once
        return total

    def setUp(self) -> None:
        """
        On test start, initialise the points and set up the code feedback library
        to provide feedback for this test.
        """
        self.points = 0.0
        Feedback.set_test(self)

    def run(self, result: unittest.TestResult | None = None) -> None:
        """
        Run the actual test suite, saving the results in 'result'.
        """

        if (
            result is None
            or not isinstance(result, PLTestResult)
            or (not result.done_grading and not result.skip_grading)
        ):
            super().run(result)
        elif result.skip_grading:
            result.startTest(self)
            self.setUp()
            result.addError(self, (None, GradingSkipped()))


class PLTestCaseWithPlot(PLTestCase):
    """
    Test suite that includes plot grading.  Will automatically check plots
    for appropriate labels.
    """

    include_plt = True

    @name("Check plot labels")
    def optional_test_plot_labels(self) -> None:
        if not self.plt:
            Feedback.add_feedback("No plot to check")
            Feedback.set_score(0)
            return
        axes = self.plt.gca()
        title = axes.get_title()
        xlabel = axes.get_xlabel()
        ylabel = axes.get_ylabel()
        points = 0

        if xlabel:
            points += 1
            Feedback.add_feedback("Plot has xlabel")
        else:
            Feedback.add_feedback("Plot is missing xlabel")

        if title:
            points += 1
            Feedback.add_feedback("Plot has title")
        else:
            Feedback.add_feedback("Plot is missing title")

        if ylabel:
            points += 1
            Feedback.add_feedback("Plot has ylabel")
        else:
            Feedback.add_feedback("Plot is missing ylabel")

        Feedback.set_score(points / 3.0)

import unittest
import os
from os.path import join
from types import FunctionType
from collections import namedtuple
from pl_helpers import (points, name, save_plot, print_student_code, not_repeated)
from pl_execute import execute_code
from code_feedback import Feedback


# Needed to ensure matplotlib runs on Docker
import matplotlib
matplotlib.use('Agg')


class PLTestCase(unittest.TestCase):
    """
    Base class for test suites, using the Python unittest library.
    Handles automatic setup and teardown of testing logic.

    Methods here do not need to be overridden by test suites.
    """

    include_plt = False
    student_code_file = 'user_code.py'
    iter_num = 0
    total_iters = 1

    @classmethod
    def setUpClass(cls):
        """
        On start, run the user code and generate answer tuples.
        """
        Feedback.set_test(cls)
        filenames_dir = os.environ.get("FILENAMES_DIR")
        base_dir = os.environ.get("MERGE_DIR")
        cls.student_code_abs_path = join(base_dir, cls.student_code_file)
        ref_result, student_result, plot_value = execute_code(join(filenames_dir, 'ans.py'),
                                                              join(base_dir, cls.student_code_file),
                                                              cls.include_plt,
                                                              join(base_dir, 'output.txt'),
                                                              cls.iter_num)
        answerTuple = namedtuple('answerTuple', ref_result.keys())
        cls.ref = answerTuple(**ref_result)
        studentTuple = namedtuple('studentTuple', student_result.keys())
        cls.st = studentTuple(**student_result)
        cls.plt = plot_value
        if cls.include_plt:
            cls.display_plot()


    @classmethod
    def tearDownClass(cls):
        """
        Close all plots and increment the iteration number on test finish
        """

        if cls.include_plt:
            cls.plt.close('all')
        cls.iter_num += 1


    @classmethod
    def display_plot(cls):
        axes = cls.plt.gca()
        if axes.get_lines() or axes.collections or axes.patches or axes.images:
            save_plot(cls.plt, cls.iter_num)


    @classmethod
    def get_total_points(cls):
        """
        Get the total number of points awarded by this test suite, including
        cases where the test suite is run multiple times.
        """

        methods = [y for x, y in cls.__dict__.items()
                   if callable(y) and hasattr(y, '__dict__') and x.startswith('test_') and 'points' in y.__dict__]
        if cls.total_iters == 1:
            total = sum([m.__dict__['points'] for m in methods])
        else:
            once = sum([m.__dict__['points'] for m in methods
                       if not m.__dict__.get('__repeated__', True)])
            several = sum([m.__dict__['points'] for m in methods
                          if m.__dict__.get('__repeated__', True)])
            total = cls.total_iters*several + once
        return total


    def setUp(self):
        """
        On test start, initialise the points and set up the code feedback library
        to provide feedback for this test.
        """

        self.points = 0
        Feedback.set_test(self)


    def run(self, result=None):
        """
        Run the actual test suite, saving the results in 'result'.
        """

        test_id = self.id().split('.')[-1]
        if not result.done_grading:
            super(PLTestCase, self).run(result)


class PLTestCaseWithPlot(PLTestCase):
    """
    Test suite that includes plot grading.  Will automatically check plots
    for appropriate labels.
    """
    include_plt = True

    @name('Check plot labels')
    def optional_test_plot_labels(self):
        axes = self.plt.gca()
        title = axes.get_title()
        xlabel = axes.get_xlabel()
        ylabel = axes.get_ylabel()
        points = 0

        if xlabel:
            points += 1
            Feedback.add_feedback('Plot has xlabel')
        else:
            Feedback.add_feedback('Plot is missing xlabel')

        if title:
            points += 1
            Feedback.add_feedback('Plot has title')
        else:
            Feedback.add_feedback('Plot is missing title')

        if ylabel:
            points += 1
            Feedback.add_feedback('Plot has ylabel')
        else:
            Feedback.add_feedback('Plot is missing ylabel')

        Feedback.set_score(points / 3.0)

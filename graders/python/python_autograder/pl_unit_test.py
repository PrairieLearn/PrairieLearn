import unittest
import os
import json
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
    def setUpClass(self):
        """
        On start, run the user code and generate answer tuples.
        """
        Feedback.set_test(self)
        base_dir = os.environ.get("MERGE_DIR")
        job_dir = os.environ.get("JOB_DIR")
        filenames_dir = os.environ.get("FILENAMES_DIR")
        self.student_code_abs_path = join(base_dir, self.student_code_file)

        # Load data so that we can use it in the test cases
        filenames_dir = os.environ.get("FILENAMES_DIR")
        with open(join(filenames_dir, 'data.json')) as f:
            self.data = json.load(f)

        ref_result, student_result, plot_value = execute_code(join(filenames_dir, 'ans.py'),
                                                              join(base_dir, self.student_code_file),
                                                              self.include_plt,
                                                              join(base_dir, 'output.txt'),
                                                              self.iter_num)
        answerTuple = namedtuple('answerTuple', ref_result.keys())
        self.ref = answerTuple(**ref_result)
        studentTuple = namedtuple('studentTuple', student_result.keys())
        self.st = studentTuple(**student_result)
        self.plt = plot_value
        if self.include_plt:
            self.display_plot()


    @classmethod
    def tearDownClass(self):
        """
        Close all plots and increment the iteration number on test finish
        """

        if self.include_plt:
            self.plt.close('all')
        self.iter_num += 1


    @classmethod
    def display_plot(self):
        axes = self.plt.gca()
        if axes.get_lines() or axes.collections or axes.patches or axes.images:
            save_plot(self.plt, self.iter_num)


    @classmethod
    def get_total_points(self):
        """
        Get the total number of points awarded by this test suite, including
        cases where the test suite is run multiple times.
        """

        methods = [y for x, y in self.__dict__.items()
                   if callable(y) and hasattr(y, '__dict__') and x.startswith('test_') and 'points' in y.__dict__]
        if self.total_iters == 1:
            total = sum([m.__dict__['points'] for m in methods])
        else:
            once = sum([m.__dict__['points'] for m in methods
                       if not m.__dict__.get('__repeated__', True)])
            several = sum([m.__dict__['points'] for m in methods
                          if m.__dict__.get('__repeated__', True)])
            total = self.total_iters*several + once
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

import traceback
import unittest
from code_feedback import GradingComplete, Feedback
from pl_execute import UserCodeFailed
from pl_helpers import print_student_code, DoNotRun


class PLTestResult(unittest.TestResult):
    """
    Helper class for generating results of a test suite using the Python
    unittest library.
    """

    error_message = ('The grading code failed -- sorry about that!\n\n'
                     'This may be an issue with your code.\nIf so, you can '
                     'take a look at the traceback below to help debug.\n'
                     'If you believe this is an issue with the grading code,\n'
                     'please notify the course staff.\n\n'
                     'The error traceback is below:\n')

    major_error_message = ('The grading code was not able to run.\n'
                           'Please notify the course staff '
                           'and include this entire message,\n'
                           'including the traceback below.\n\n'
                           'The error traceback is:\n')

    def __init__(self):
        unittest.TestResult.__init__(self)
        self.results = []
        self.format_errors = []
        self.main_feedback = ''
        self.buffer = False
        self.done_grading = False
        self.grading_succeeded = True

    def startTest(self, test):
        unittest.TestResult.startTest(self, test)
        options = getattr(test, test._testMethodName).__func__.__dict__
        points = options.get('points', 1)
        name = options.get('name', test.shortDescription())
        filename = test._testMethodName

        if name is None:
            name = test._testMethodName
        self.results.append({'name': name, 'max_points': points, 'filename': filename})

    def addSuccess(self, test):
        unittest.TestResult.addSuccess(self, test)
        if test.points is None:
            self.results[-1]['points'] = self.results[-1]['max_points']
        else:
            self.results[-1]['points'] = (test.points *
                                          self.results[-1]['max_points'])

    def addError(self, test, err):
        if isinstance(err[1], GradingComplete):
            self.done_grading = True
            self.addFailure(test, err)
        elif isinstance(err[1], DoNotRun):
            self.results[-1]['points'] = 0
            self.results[-1]['max_points'] = 0
        elif isinstance(err[1], UserCodeFailed):
            # Student code raised Exception
            tr_list = traceback.format_exception(*err[1].err)
            name = 'Your code raised an Exception'
            self.done_grading = True
            if isinstance(err[1].err[1], SyntaxError) or isinstance(err[1].err[1], NameError):
                self.grading_succeeded = False
                self.format_errors.append('Your code has a syntax error.')
                Feedback.set_main_output()
            else:
                self.results.append({'name': name,
                                     'filename': 'error',
                                     'max_points': 1,
                                     'points': 0})
                Feedback.set_name('error')
            Feedback.add_feedback(''.join(tr_list))
            Feedback.add_feedback('\n\nYour code:\n\n')
            print_student_code(st_code=Feedback.test.student_code_abs_path, ipynb_key=Feedback.test.ipynb_key)
        else:
            tr_list = traceback.format_exception(*err)
            test_id = test.id().split()[0]
            if not test_id.startswith('test'):
                # Error in setup code -- not recoverable
                self.done_grading = True
                self.grading_succeeded = False
                self.results = []
                self.results.append({'name': 'Internal Grading Error',
                                     'filename': 'error',
                                     'max_points': 1,
                                     'points': 0})
                Feedback.set_name('error')
                Feedback.add_feedback(self.major_error_message +
                                      ''.join(tr_list))
            else:
                # Error in a single test -- keep going
                unittest.TestResult.addError(self, test, err)
                self.results[-1]['points'] = 0
                Feedback.add_feedback(self.error_message + ''.join(tr_list))


    def addFailure(self, test, err):
        unittest.TestResult.addFailure(self, test, err)
        if test.points is None:
            self.results[-1]['points'] = 0
        else:
            self.results[-1]['points'] = (test.points *
                                          self.results[-1]['max_points'])

    def stopTest(self, test):
        # Never write output back to the console
        self._mirrorOutput = False
        unittest.TestResult.stopTest(self, test)

    def getResults(self):
        return self.results

    def getGradable(self):
        return self.grading_succeeded

import traceback
import unittest
from typing import Any

from code_feedback import Feedback, GradingComplete, TestComplete
from pl_execute import UserCodeFailedError
from pl_helpers import DoNotRunError, GradingSkipped, print_student_code


class PLTestResult(unittest.TestResult):
    """
    Helper class for generating results of a test suite using the Python
    unittest library.
    """

    error_message = (
        "There was an error while grading your code.\n\n"
        "Review the question text to ensure your code matches\nthe expected requirements, such as variable names,\nfunction names, and parameters.\n\n"
        "Look at the traceback below to help debug your code:\n"
    )
    grader_error_message = (
        "The grader encountered an error while grading your code.\n\n"
        "The associated traceback is:\n"
    )

    def __init__(self) -> None:
        unittest.TestResult.__init__(self)
        self.results = []
        self.format_errors = []
        self.main_feedback = ""
        self.buffer = False
        self.done_grading = False
        self.grading_succeeded = True

        # If we end grading early, we still want to run through the remaining test cases
        # (but not execute them) so that we show the correct number of points on the grading panel
        self.skip_grading = False

    def startTest(self, test: unittest.TestCase) -> None:  # noqa: N802
        unittest.TestResult.startTest(self, test)

        options = getattr(test, test._testMethodName).__func__.__dict__

        points = options.get("points", 1)
        name = options.get("name", test.shortDescription())
        filename = test._testMethodName

        if name is None:
            name = test._testMethodName
        self.results.append({"name": name, "max_points": points, "filename": filename})

    def addSuccess(self, test: Any | unittest.TestCase) -> None:  # noqa: N802
        unittest.TestResult.addSuccess(self, test)
        points = getattr(test, "points", None)
        if points is None:
            self.results[-1]["points"] = self.results[-1]["max_points"]
        else:
            self.results[-1]["points"] = points * self.results[-1]["max_points"]

    def addError(self, test: unittest.TestCase, err: Any) -> None:  # noqa: N802
        if isinstance(err[1], (GradingComplete, TestComplete)):
            # Either the test suite as a whole or this specific test case was stopped early.
            # There may be points set; if not, set to 0.
            points = getattr(test, "points", None)
            if points is None:
                self.results[-1]["points"] = 0
            else:
                self.results[-1]["points"] = points * self.results[-1]["max_points"]

            if isinstance(err[1], GradingComplete):
                # Grading was stopped early; don't run any more tests. We'll still
                # loop through the remaining cases so that we have the correct point values.
                self.skip_grading = True
        elif isinstance(err[1], DoNotRunError):
            self.results[-1]["points"] = 0
            self.results[-1]["max_points"] = 0
        elif isinstance(err[1], GradingSkipped):
            self.results[-1]["points"] = 0
            Feedback.set_name(test._testMethodName)
            Feedback.add_feedback(
                " - Grading was skipped because an earlier test failed - "
            )
        elif isinstance(err[1], UserCodeFailedError):
            # Student code raised Exception
            tr_list = traceback.format_exception(*err[1].err)
            name = "Your code raised an Exception"
            self.done_grading = True
            if isinstance(err[1].err[1], (SyntaxError, NameError)):
                self.grading_succeeded = False
                self.format_errors.append("Your code has a syntax error.")
                Feedback.set_main_output()
            else:
                self.results.append({
                    "name": name,
                    "filename": "error",
                    "max_points": 1,
                    "points": 0,
                })
                Feedback.set_name("error")
            Feedback.add_feedback("".join(tr_list))
            Feedback.add_feedback("\n\nYour code:\n\n")
            print_student_code(
                st_code=Feedback.test.student_code_abs_path,
                ipynb_key=Feedback.test.ipynb_key,
            )
        else:
            tr_message = "".join(traceback.format_exception(*err))

            if isinstance(test, unittest.suite._ErrorHolder):  # type: ignore
                # Error occurred outside of a test case, like in setup code for example
                # We can't really recover from this

                self.done_grading = True
                self.grading_succeeded = False
                self.results = [
                    {
                        "name": "Internal Grading Error",
                        "filename": "error",
                        "max_points": 1,
                        "points": 0,
                    }
                ]
                Feedback.set_name("error")
                Feedback.add_feedback(self.grader_error_message + tr_message)
            else:
                # Error in a single test -- keep going
                unittest.TestResult.addError(self, test, err)
                self.results[-1]["points"] = 0
                Feedback.add_feedback(self.error_message + tr_message)

    def addFailure(self, test: unittest.TestCase, err: Any) -> None:  # noqa: N802
        unittest.TestResult.addFailure(self, test, err)
        # # We can't easily import PLTestCase to type these fields
        if test.points is None:  # type: ignore
            self.results[-1]["points"] = 0
        else:
            self.results[-1]["points"] = test.points * self.results[-1]["max_points"]  # type: ignore

    def stopTest(self, test: unittest.TestCase) -> None:  # noqa: N802
        # Never write output back to the console
        self._mirrorOutput = False
        unittest.TestResult.stopTest(self, test)

    def getResults(self) -> list[dict[str, Any]]:  # noqa: N802
        return self.results

    def getGradable(self) -> bool:  # noqa: N802
        return self.grading_succeeded

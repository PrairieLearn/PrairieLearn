import unittest
from unittest import TestLoader, TestSuite
import json
import traceback


def points(points):
    def decorator(f):
        f.__dict__['points'] = points
        return f
    return decorator


def name(name):
    def decorator(f):
        f.__dict__['name'] = name
        return f
    return decorator


class PrairieTestRunner:
    def run(self, test):
        result = PrairieTestResult(self)
        test(result)
        return result


class PrairieTestResult(unittest.TestResult):

    def __init__(self, runner):
        unittest.TestResult.__init__(self)
        self.results = []
        self.buffer = True

    def startTest(self, test):
        unittest.TestResult.startTest(self, test)
        options = getattr(test, test._testMethodName).__func__.__dict__
        points = options.get('points', 1)
        name = options.get('name', test.shortDescription())
        if name is None:
            name = test._testMethodName
        self.results.append({'name': name, 'max_points': points})

    def addSuccess(self, test):
        unittest.TestResult.addSuccess(self, test)
        self.results[-1]['points'] = self.results[-1]['max_points']

    def addError(self, test, err):
        unittest.TestResult.addError(self, test, err)
        self.results[-1]['points'] = 0
        self.results[-1]['output'] = self.errors[-1][1]

    def addFailure(self, test, err):
        unittest.TestResult.addFailure(self, test, err)
        self.results[-1]['points'] = 0
        self.results[-1]['output'] = self.failures[-1][1]

    def stopTest(self, test):
        # Never write output back to the console
        self._mirrorOutput = False
        unittest.TestResult.stopTest(self, test)

    def getResults(self):
        return self.results


if __name__ == '__main__':
    try:
        from test import Test

        # Run the tests with our custom setup
        loader = TestLoader()
        # Maintain the ordering that tests appear in the source code
        loader.sortTestMethodsUsing = lambda x, y: -1
        tests = loader.loadTestsFromTestCase(Test)
        suite = TestSuite([tests])
        runner = PrairieTestRunner()
        results = runner.run(suite).getResults()

        # Compile total number of points
        max_points = sum([test['max_points'] for test in results])
        earned_points = sum([test['points'] for test in results])

        # Assemble final grading results
        grading_result = {}
        grading_result['tests'] = results
        grading_result['score'] = float(earned_points) / float(max_points)
        grading_result['succeeded'] = True
        print(json.dumps(grading_result, allow_nan=False))

        with open('results.json', mode='w') as out:
            json.dump(grading_result, out)
    except:
        # Last-ditch effort to capture meaningful error information
        grading_result = {}
        grading_result['score'] = 0.0
        grading_result['succeeded'] = False
        grading_result['output'] = traceback.format_exc()

        with open('results.json', mode='w') as out:
            json.dump(grading_result, out)

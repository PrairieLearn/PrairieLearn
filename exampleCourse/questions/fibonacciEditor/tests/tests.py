import unittest
from unittest import TestLoader, TestSuite, TextTestRunner
import pltest as pltest
from bin.fib import fib


class TestFibonacci(unittest.TestCase):
    @pltest.points(1)
    def test_zero(self):
        self.assertEqual(fib(0), 0)

    @pltest.points(1)
    def test_one(self):
        self.assertEqual(fib(1), 1)

    @pltest.points(3)
    def test_integer(self):
        self.assertEqual(fib(7), 13)


if __name__ == '__main__':
    tests = TestLoader().loadTestsFromTestCase(TestFibonacci)
    suite = TestSuite([tests])
    runner = TextTestRunner()
    runner.run(suite)

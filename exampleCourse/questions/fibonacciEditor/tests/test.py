import unittest
from pltest import name, points
from bin.fib import fib


class Test(unittest.TestCase):
    @points(1)
    @name('Check 0!')
    def test_zero(self):
        self.assertEqual(fib(0), 0)

    @points(1)
    @name('Check 1!')
    def test_one(self):
        self.assertEqual(fib(1), 1)

    @points(3)
    @name('Check factorial of an integer > 1')
    def test_integer(self):
        self.assertEqual(fib(7), 13)

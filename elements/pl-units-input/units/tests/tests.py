import unittest
from units import *

class TestBaseUnit(unittest.TestCase):
    def test_base_unit_equality(self):
        self.assertEqual(MetricUnits.m.value, ImperialUnits.ft.value)
        self.assertEqual(MetricUnits.s.value, MetricUnits.min.value)
        self.assertEqual(MetricUnits.g.value, ImperialUnits.oz.value)

    def test_compound_unit_equality(self):
        self.assertEqual(MetricUnits.s.value * MetricUnits.A.value, MetricUnits.C.value)
        self.assertEqual(MetricUnits.h.value * MetricUnits.A.value, MetricUnits.C.value)
        self.assertEqual(1000 * MetricUnits.g.value * MetricUnits.m.value * MetricUnits.s.value ** -2, 1000 * 0.01 * MetricUnits.g.value * MetricUnits.m.value * MetricUnits.s.value ** -2)

class TestParse(unittest.TestCase):
    def test_safety(self):
        # inspired by https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
        self.assertRaises(DisallowedExpression, Unit.from_string, "print('Hello, World!')")
        self.assertRaises(DisallowedExpression, Unit.from_string, "__import__('os').system('rm -rf /')")
        KABOOM = """
(lambda fc=(
    lambda n: [
        c for c in
            ().__class__.__bases__[0].__subclasses__()
            if c.__name__ == n
        ][0]
    ):
    fc("function")(
        fc("code")(
            0,0,0,0,"KABOOM",(),(),(),"","",0,""
        ),{}
    )()
)()
"""
        self.assertRaises(DisallowedExpression, Unit.from_string, KABOOM)
    
    def test_metric(self):
        self.assertEqual(Unit.from_string("N"), MetricUnits.N.value)
        self.assertEqual(Unit.from_string("pF"), MetricUnits.F.value)
        self.assertEqual(Unit.from_string("mm"), MetricUnits.m.value)
        self.assertEqual(Unit.from_string("TT"), MetricUnits.T.value)
        self.assertRaises(InvalidUnit, Unit.from_string, "p")
        self.assertRaises(InvalidUnit, Unit.from_string, "approximatelyfivethousandbarkingchihuahuas")
        self.assertEqual(Unit.from_string("kg * m / s**2"), MetricUnits.N.value)

    def test_imperial(self):
        self.assertEqual(Unit.from_string("lb"), ImperialUnits.lb.value)
        self.assertEqual(Unit.from_string("lb"), MetricUnits.g.value)
        self.assertEqual(Unit.from_string("oz"), ImperialUnits.oz.value)
        self.assertRaises(InvalidUnit, Unit.from_string, "koz")

class TestEquality(unittest.TestCase):
    def test_equality(self):
        self.assertEqual(DimensionfulQuantity(10, Unit.from_string("N")), DimensionfulQuantity(10, Unit.from_string("N")))
        self.assertEqual(DimensionfulQuantity(1000, Unit.from_string("N")), DimensionfulQuantity(1, Unit.from_string("kN")))

if __name__ == "__main__":
    unittest.main()

import unittest

import units


class TestBaseUnit(unittest.TestCase):
    def test_base_unit_equality(self):
        self.assertEqual(units.MetricUnits.m.value, units.ImperialUnits.ft.value)
        self.assertEqual(units.MetricUnits.s.value, units.MetricUnits.min.value)
        self.assertEqual(units.MetricUnits.g.value, units.ImperialUnits.oz.value)

    def test_compound_unit_equality(self):
        self.assertEqual(units.MetricUnits.s.value * units.MetricUnits.A.value, units.MetricUnits.C.value)
        self.assertEqual(units.MetricUnits.h.value * units.MetricUnits.A.value, units.MetricUnits.C.value)
        self.assertEqual(1000 * units.MetricUnits.g.value * units.MetricUnits.m.value * units.MetricUnits.s.value ** -2, 1000 * 0.01 * units.MetricUnits.g.value * units.MetricUnits.m.value * units.MetricUnits.s.value ** -2)


class TestParse(unittest.TestCase):
    def test_safety(self):
        # inspired by https://nedbatchelder.com/blog/201206/eval_really_is_dangerous.html
        self.assertRaises(units.DisallowedExpression, units.Unit.from_string, "print('Hello, World!')")
        self.assertRaises(units.DisallowedExpression, units.Unit.from_string, "__import__('os').system('rm -rf /')")
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
        self.assertRaises(units.DisallowedExpression, units.Unit.from_string, KABOOM)

    def test_metric(self):
        self.assertEqual(units.Unit.from_string('N'), units.MetricUnits.N.value)
        self.assertEqual(units.Unit.from_string('pF'), units.MetricUnits.F.value)
        self.assertEqual(units.Unit.from_string('mm'), units.MetricUnits.m.value)
        self.assertEqual(units.Unit.from_string('TT'), units.MetricUnits.T.value)
        self.assertRaises(units.InvalidUnit, units.Unit.from_string, 'p')
        self.assertRaises(units.InvalidUnit, units.Unit.from_string, 'approximatelyfivethousandbarkingchihuahuas')
        self.assertEqual(units.Unit.from_string('kg * m / s**2'), units.MetricUnits.N.value)

    def test_imperial(self):
        self.assertEqual(units.Unit.from_string('lb'), units.ImperialUnits.lb.value)
        self.assertEqual(units.Unit.from_string('lb'), units.MetricUnits.g.value)
        self.assertEqual(units.Unit.from_string('oz'), units.ImperialUnits.oz.value)
        self.assertRaises(units.InvalidUnit, units.Unit.from_string, 'koz')


class TestEquality(unittest.TestCase):
    def test_equality(self):
        self.assertEqual(units.DimensionfulQuantity(10, units.Unit.from_string('N')), units.DimensionfulQuantity(10, units.Unit.from_string('N')))
        self.assertEqual(units.DimensionfulQuantity(1000, units.Unit.from_string('N')), units.DimensionfulQuantity(1, units.Unit.from_string('kN')))


if __name__ == '__main__':
    unittest.main()

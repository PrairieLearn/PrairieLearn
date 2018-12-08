import unittest
import lxml.html
import prairielearn as pl

class TestPrairielearnLib(unittest.TestCase):

  def test_inner_html(self):
    e = lxml.html.fragment_fromstring('test')
    self.assertEqual(pl.inner_html(e), 'test')

if __name__ == '__main__':
    unittest.main()

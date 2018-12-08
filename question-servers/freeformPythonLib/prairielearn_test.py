# lol
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../lib')))
print(sys.path)

import prairielearn as pl
import unittest
import lxml.html

class TestPrairielearnLib(unittest.TestCase):

  def test_inner_html(self):
    e = lxml.html.fragment_fromstring('<div>test</div>')
    self.assertEqual(pl.inner_html(e), 'test')

    e = lxml.html.fragment_fromstring('<div>test&gt;test</div>')
    self.assertEqual(pl.inner_html(e), 'test&gt;test')

if __name__ == '__main__':
    unittest.main()

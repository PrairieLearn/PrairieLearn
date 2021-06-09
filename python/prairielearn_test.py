# lol
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../lib')))

import prairielearn as pl  # noqa: E402
import unittest            # noqa: E402
import lxml.html           # noqa: E402


class TestPrairielearnLib(unittest.TestCase):

    def test_inner_html(self):
        e = lxml.html.fragment_fromstring('<div>test</div>')
        self.assertEqual(pl.inner_html(e), 'test')

        e = lxml.html.fragment_fromstring('<div>test&gt;test</div>')
        self.assertEqual(pl.inner_html(e), 'test&gt;test')


if __name__ == '__main__':
    unittest.main()

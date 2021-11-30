# lol
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../lib')))

import prairielearn as pl  # noqa: E402
import lxml.html           # noqa: E402


def test_inner_html():
    e = lxml.html.fragment_fromstring('<div>test</div>')
    assert pl.inner_html(e) == 'test'

    e = lxml.html.fragment_fromstring('<div>test&gt;test</div>')
    assert pl.inner_html(e) == 'test&gt;test'

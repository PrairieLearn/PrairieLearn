import textwrap

import lxml.html

orig_html = textwrap.dedent(
    """
<div attr="foo & bar"></div>
    """
)

fragments = lxml.html.fragments_fromstring(orig_html)

print(lxml.html.tostring(fragments[0], pretty_print=True).decode())

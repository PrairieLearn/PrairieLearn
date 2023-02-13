import lxml.html
import textwrap

orig_html = textwrap.dedent(
    """
<div>
    <p foo='bar'>Hello <strong>world</strong>  </p>
      <div>
       <p>What
         </p>
    </div>
</div>
    """
)

fragments = lxml.html.fragments_fromstring(orig_html)

fragments[0].getchildren()[0].insert(
    1,
    lxml.html.fragment_fromstring(
        """
    <i>Testing</i>
        """
    ),
)

print(lxml.html.tostring(fragments[0], pretty_print=True).decode())

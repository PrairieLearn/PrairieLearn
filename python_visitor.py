import lxml.html
from typing import List

fragments = lxml.html.fragments_fromstring(
    """
<pl-question-panel>
  <p> Consider two numbers $a = {{params.a}}$ and $b = {{params.b}}$.</p>
  <p> What is the sum $c = a + b$?</p>
</pl-question-panel>

<pl-integer-input answers-name="c" label="$c=$"></pl-integer-input>
"""
)

print(fragments)


def visit_element(element: lxml.html.HtmlElement):
    print(element, type(element), element.tag)

    if element.tag == "pl-integer-input":
        new_elements = lxml.html.fragments_fromstring(
            "<wtf-element></wtf-element><p>thing</p>"
        )

        parent = element.getparent()
        self_index = parent.index(element)
        parent.remove(element)
        for index, element in enumerate(new_elements):
            parent.insert(self_index + index, element)

    for child in element:
        visit_element(child)


body = fragments[0].getparent()

for element in body:
    visit_element(element)

print("".join(lxml.html.tostring(e, encoding="unicode") for e in body))

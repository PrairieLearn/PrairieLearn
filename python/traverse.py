from typing import Callable, Union

import lxml.html


def traverse_and_replace(
    html: str, replace: Callable[[lxml.html.HtmlElement], Union[str, None]]
) -> None:
    elements = lxml.html.fragments_fromstring(html)
    root_parent = elements[0].getparent()
    print("root_parent", root_parent)
    for element in root_parent:
        traverse_and_replace_impl(element, replace)
    return "".join(lxml.html.tostring(e, encoding="unicode") for e in root_parent)


def traverse_and_replace_impl(
    element: lxml.html.HtmlElement,
    replace: Callable[[lxml.html.HtmlElement], Union[str, None]],
) -> None:
    new_element = replace(element)
    if new_element is not None:
        if isinstance(new_element, str):
            new_element = lxml.html.fragments_fromstring(new_element)
        elif not isinstance(new_element, list):
            new_element = [new_element]

        parent = element.getparent()
        self_index = parent.index(element)
        parent.remove(element)
        for index, element in enumerate(new_element):
            parent.insert(self_index + index, element)

    for child in element:
        traverse_and_replace_impl(child)


if __name__ == "__main__":
    html = """
    <pl-question-panel>
    <p> Consider two numbers $a = {{params.a}}$ and $b = {{params.b}}$.</p>
    <p> What is the sum $c = a + b$?</p>
    </pl-question-panel>

    <pl-integer-input answers-name="c" label="$c=$"></pl-integer-input>
    """

    print(traverse_and_replace(html, lambda e: e))

from typing import Callable, List, Optional, Union

import lxml.html


def serialize_str_or_element(e) -> str:
    if isinstance(e, str):
        return e
    return lxml.html.tostring(e, encoding="unicode")


def traverse_and_execute(
    html: str, fn: Callable[[lxml.html.HtmlElement], None]
) -> list:
    elements = lxml.html.fragments_fromstring(html)

    # If there's leading text, the first element of the array will be a string.
    # We'll strip that off and add it back at the end, as we can't treat it
    # like an element.
    result_elements = []
    if isinstance(elements[0], str):
        result_elements.append(elements[0])
        del elements[0]

    if elements:
        root_parent = elements[0].getparent()
        children = root_parent.getchildren()
        print("traversing into element", root_parent)
        for element in children:
            result = traverse_and_execute_impl(element, fn)
            print("result", result)

        result_elements.extend(root_parent.getchildren())

    print("result_elements", result_elements)
    return result_elements


def traverse_and_execute_impl(
    element: lxml.html.HtmlElement,
    fn: Callable[[lxml.html.HtmlElement], Union[None, List[lxml.html.HtmlElement]]],
) -> None:
    new_element = fn(element)
    print("new_element", new_element)
    has_new_element = new_element is not element and (
        new_element is not None
        and len(new_element) > 0
        and new_element[0] is not element
    )
    traverse_element = (
        new_element if has_new_element and new_element is not None else element
    )
    for child in traverse_element:
        if not isinstance(child, str):
            traverse_and_execute_impl(child, fn)


def traverse_and_replace(
    html: str,
    replace: Callable[
        [lxml.html.HtmlElement],
        Optional[Union[str, lxml.html.HtmlElement, List[lxml.html.HtmlElement]]],
    ],
) -> str:
    def handle_element(
        element: lxml.html.HtmlElement,
    ) -> Optional[lxml.html.HtmlElement]:
        new_elements = replace(element)
        if new_elements is not None:
            if isinstance(new_elements, str):
                new_elements = lxml.html.fragments_fromstring(new_elements)
            elif not isinstance(new_elements, list):
                new_elements = [new_elements]

            parent = element.getparent()
            self_index = parent.index(element)

            # Special case: the element was replaced with the empty string.
            if len(new_elements) == 0:
                parent.remove(element)
                return None

            print("-------")
            print("new_elements", new_elements)
            print("existing element", element)
            print("element", lxml.html.tostring(element), element.text, element.tail)
            print("parent", lxml.html.tostring(parent), parent.text, parent.tail)

            # Special case: the first new element is just a string.
            if isinstance(new_elements[0], str):
                if self_index == 0:
                    # We need to attach this string to the `text` of the parent.
                    print("attaching to parent")
                    parent.text += new_elements[0]
                    print("parent", lxml.html.tostring(parent))
                else:
                    # We need to attach this string to the `tail` of the previous element.
                    print("attaching to previous child")
                    parent.getchildren()[self_index - 1].tail += new_elements[0]
                    print("parent", lxml.html.tostring(parent))
                del new_elements[0]

            # Special case: 
            if len(parent) == 1:

            parent.remove(element)
            print('parent after removal', lxml.html.tostring(parent))
            print("iterating over elements", new_elements, type(new_elements))
            for index, new_element in enumerate(new_elements):
                print("iteration", index, new_element)
                parent.insert(self_index + index, new_element)

            return new_elements

    elements = traverse_and_execute(html, handle_element)

    return "".join(serialize_str_or_element(e) for e in elements)


if __name__ == "__main__":
    html = """
    <pl-question-panel>
    <p> Consider two numbers $a = {{params.a}}$ and $b = {{params.b}}$.</p>
    <p> What is the sum $c = a + b$?</p>
    </pl-question-panel>

    <pl-integer-input answers-name="c" label="$c=$"></pl-integer-input>
    """

    print(traverse_and_replace(html, lambda e: e))

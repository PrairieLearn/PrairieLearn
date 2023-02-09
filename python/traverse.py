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

    # Special case: just a string.
    if len(elements) == 1 and isinstance(elements[0], str):
        return elements

    # If there's leading text, the first element of the array will be a string.
    # We'll strip that off and add it back at the end, as we can't treat it
    # like an element.
    # TODO: update above comment.
    if isinstance(elements[0], str):
        del elements[0]

    root_parent = elements[0].getparent()
    children = root_parent.getchildren()
    print("traversing into element", root_parent)
    for element in children:
        result = traverse_and_execute_impl(element, fn)
        print("result", result)

    print("root_parent", root_parent, lxml.html.tostring(root_parent))
    print("root_parent.getchildren()", root_parent.getchildren())

    result_elements = root_parent.getchildren()
    if root_parent.text:
        result_elements.insert(0, root_parent.text)

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

        # Special case: returned the current element (no change).
        if new_elements is element:
            return None

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
            print(
                "element",
                element,
                lxml.html.tostring(element),
                element.text,
                element.tail,
            )
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

            # Special case: our parent has only a single child (us) and the
            # element we're removing has trailing text. In that case, we should
            # reattach that text to the end of the last new element OR to the
            # parent's text.
            if len(parent) == 1 and element.tail is not None:
                if len(new_elements) > 0:
                    print("attaching tail")
                    print(
                        "new_elements[-1]",
                        lxml.html.tostring(new_elements[-1]),
                        new_elements[-1].tail,
                    )
                    print("element", lxml.html.tostring(element), element.tail)
                    if new_elements[-1].tail:
                        new_elements[-1].tail += element.tail
                    else:
                        new_elements[-1].tail = element.tail
                else:
                    print("attaching tail to parent")
                    print("attaching tail to tail of body")
                    if parent.text:
                        parent.text += element.tail
                    else:
                        parent.text = element.tail
                print("parent", lxml.html.tostring(parent))

            parent.remove(element)
            print("parent after removal", lxml.html.tostring(parent))
            print("iterating over elements", new_elements, type(new_elements))
            for index, new_element in enumerate(new_elements):
                print("iteration", index, new_element)
                parent.insert(self_index + index, new_element)
            print("parent after insertion", lxml.html.tostring(parent))

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

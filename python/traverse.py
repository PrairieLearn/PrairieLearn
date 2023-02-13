from collections import deque
from typing import Callable, Deque, List, Optional, Tuple, Union
import timeit

import lxml.html

ElementReplacement = Optional[
    Union[str, lxml.html.HtmlElement, List[lxml.html.HtmlElement]]
]


def serialize_str_or_element(e) -> str:
    if isinstance(e, str):
        return e
    return lxml.html.tostring(e, encoding="unicode")


def append_text(element: lxml.html.HtmlElement, text: str) -> None:
    stripped_text = text.lstrip()

    if element.text:
        # print("appending element text", text)
        stripped_element_text = element.text.rstrip()
        sep = " " if stripped_element_text and stripped_text else ""
        element.text = stripped_element_text + sep + stripped_text
    else:
        # print("setting element text", text)
        element.text = stripped_text


def append_tail(element: lxml.html.HtmlElement, text: str) -> None:
    stripped_text = text.lstrip()

    if element.tail:
        # print("appending element tail", text)
        stripped_element_tail = element.tail.rstrip()
        sep = " " if stripped_element_tail and stripped_text else ""
        element.tail = stripped_element_tail + sep + stripped_text
    else:
        # print("setting element tail", text)
        element.tail = " " + stripped_text


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
    # print("traversing into element", root_parent)
    for element in children:
        traverse_and_execute_impl(element, fn)

    # print("root_parent", root_parent, lxml.html.tostring(root_parent))
    # print("root_parent.getchildren()", root_parent.getchildren())

    result_elements = root_parent.getchildren()
    if root_parent.text:
        result_elements.insert(0, root_parent.text)

    # print("result_elements", result_elements)
    return result_elements


def traverse_and_execute_impl(
    element: lxml.html.HtmlElement,
    fn: Callable[[lxml.html.HtmlElement], Union[None, List[lxml.html.HtmlElement]]],
) -> None:
    new_element = fn(element)
    # print("new_element", new_element)
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


def traverse_and_replace_old(
    html: str,
    replace: Callable[
        [lxml.html.HtmlElement],
        ElementReplacement,
    ],
) -> str:
    def handle_element(
        element: lxml.html.HtmlElement,
    ) -> Optional[lxml.html.HtmlElement]:
        new_elements = replace(element)

        # Special case: returned the current element (no change).
        if new_elements is element:
            return None

        parent = element.getparent()
        self_index = parent.index(element)
        previous_element = (
            parent.getchildren()[self_index - 1] if self_index > 0 else None
        )

        # Special case: returned None (remove the element).
        if new_elements is None:
            # If the removed element has trailing text, attach it to either
            # the parent or the previous element.
            if element.tail:
                if self_index == 0:
                    append_text(parent, element.tail)
                else:
                    append_tail(previous_element, element.tail)

            parent.remove(element)

        if new_elements is not None:
            if isinstance(new_elements, str):
                new_elements = lxml.html.fragments_fromstring(new_elements)
            elif not isinstance(new_elements, list):
                new_elements = [new_elements]

            # Special case: the element was replaced with the empty string.
            if len(new_elements) == 0:
                parent.remove(element)
                return None

            # print("-------")
            # print("new_elements", new_elements)
            # print(
            #     "element",
            #     element,
            #     lxml.html.tostring(element),
            #     element.text,
            #     element.tail,
            # )
            # print("parent", lxml.html.tostring(parent), parent.text, parent.tail)

            # Special case: the first new element is just a string.
            if isinstance(new_elements[0], str):
                if self_index == 0:
                    # We need to attach this string to the `text` of the parent.
                    # print("attaching to parent")
                    append_text(parent, new_elements[0])
                    # print("parent", lxml.html.tostring(parent))
                else:
                    # We need to attach this string to the `tail` of the previous element.
                    print("attaching to previous child")
                    append_tail(previous_element, new_elements[0])
                    print("parent", lxml.html.tostring(parent))
                del new_elements[0]

            # print("len(parent)", len(parent))

            # Special case: the element we're replacing has trailing text.
            if len(parent) > 1 and element.tail is not None:
                last_new_element = new_elements[-1] if len(new_elements) > 0 else None
                if self_index == 0:
                    if last_new_element is not None:
                        # We need to attach this string to the `text` of the parent.
                        # print("attaching tail to last new element")
                        append_tail(last_new_element, element.tail)
                        # print("last_new_element", lxml.html.tostring(last_new_element))
                    else:
                        # print("attaching tail to parent text")
                        append_text(parent, element.tail)
                else:
                    # We need to attach this string to the `tail` of the previous element.
                    # print("attaching tail to previous child (multi)")
                    append_tail(previous_element, element.tail)

            # Special case: our parent has only a single child (us) and the
            # element we're removing has trailing text. In that case, we should
            # reattach that text to the end of the last new element OR to the
            # parent's text.
            if len(parent) == 1 and element.tail is not None:
                if len(new_elements) > 0:
                    # print("attaching tail")
                    # print(
                    #     "new_elements[-1]",
                    #     lxml.html.tostring(new_elements[-1]),
                    #     new_elements[-1].tail,
                    # )
                    # print("element", lxml.html.tostring(element), element.tail)
                    append_tail(new_elements[-1], element.tail)
                else:
                    # print("attaching tail to parent")
                    append_text(parent, element.tail)
                # print("parent", lxml.html.tostring(parent))

            parent.remove(element)
            # print("parent after removal", lxml.html.tostring(parent))
            # print("iterating over elements", new_elements, type(new_elements))
            for index, new_element in enumerate(new_elements):
                # print("iteration", index, new_element)
                parent.insert(self_index + index, new_element)
            # print("parent after insertion", lxml.html.tostring(parent))

            return new_elements

    elements = traverse_and_execute(html, handle_element)

    return "".join(serialize_str_or_element(e) for e in elements)


def get_source_definition(element: lxml.html.HtmlElement) -> str:
    # https://html.spec.whatwg.org/multipage/parsing.html#escapingString
    attributes = (
        f'''{k}="{v.replace('"', "&quot;")}"''' for k, v in element.attrib.items()
    )
    return f"<{' '.join((element.tag, *attributes))}>"


def traverse_and_replace(
    html: str, replace: Callable[[lxml.html.HtmlElement], ElementReplacement]
) -> str:
    # Initialize result and work data structures
    result: Deque[Union[str, lxml.html.HtmlElement]] = deque()

    initial_list = lxml.html.fragments_fromstring(html)
    count_stack: Deque[int] = deque([len(initial_list)])
    work_stack: Deque[Union[str, lxml.html.HtmlElement]] = deque(reversed(initial_list))
    tail_stack: Deque[Tuple[str, Optional[str]]] = deque()

    while work_stack:
        element = work_stack.pop()

        # For just a string, append to final result
        if isinstance(element, str):
            result.append(element)

        else:
            new_elements = replace(element)

            # Turn new_elements into a list containing we can process
            if new_elements is None:
                new_elements = []
            elif isinstance(new_elements, str):
                fragments = lxml.html.fragments_fromstring(new_elements)
                new_elements = fragments if fragments is not None else []

            if isinstance(new_elements, list):
                # Modify count stack for new elements and decrement for element that was replaced
                count_stack[-1] += len(new_elements) - 1

                # Add element tail before processing replaced element
                if element.tail is not None:
                    count_stack[-1] += 1
                    work_stack.append(element.tail)

                # Extend and go to the next iteration
                if new_elements:
                    work_stack.extend(reversed(new_elements))

                continue

            if isinstance(new_elements, lxml.html.HtmlComment):
                result.append(lxml.html.tostring(new_elements, encoding="unicode"))
                continue

            # Add opening tag and text
            result.append(get_source_definition(new_elements))

            if new_elements.text is not None:
                result.append(new_elements.text)

            # Add all children to the work stack
            children = list(new_elements)

            if children:
                work_stack.extend(reversed(children))

            count_stack.append(len(children))
            tail_stack.append((new_elements.tag, element.tail))

        # Close all closable tags
        while count_stack[-1] == 0:
            count_stack.pop()
            tail_tag, tail_text = tail_stack.pop()

            result.append(f"</{tail_tag}>")
            if tail_text is not None:
                result.append(tail_text)
        else:
            count_stack[-1] -= 1

    # No need to empty tail stack, should be empty from above
    # can add asserts that the tail stack and count stack are
    # empty here to debug

    return "".join(result)


if __name__ == "__main__":
    html = """
    <pl-question-panel>
    <p> Consider two numbers $a = {{params.a}}$ and $b = {{params.b}}$.</p>
    <p> What is the sum $c = a + b$?</p>
    </pl-question-panel>

    <pl-integer-input answers-name="c" label="$c=$"></pl-integer-input>

    <pl-answer-panel>
      <pl-code-tabs filename="foo.py"></pl-code-tabs>
    </pl-answer-panel>
    """

    def replace(e: lxml.html.Element) -> str:
        if e.tag == "<pl-integer-input>":
            return "<pl-number-input></pl-number-input>"
        if e.tag == "pl-number-input":
            return '<input type="number" />'
        if e.tag == "pl-code-tabs":
            return "<div><pl-code></pl-code><pl-code></pl-code></div>"
        if e.tag == "pl-code":
            return "<pre><code>foo</code></pre>"

    original = timeit.timeit(
        lambda: traverse_and_replace_old(html, replace), number=1000
    )

    print("original", original)

    new = timeit.timeit(lambda: traverse_and_replace(html, replace), number=1000)

    print("new", new)

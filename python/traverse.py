import codecs
import timeit
from collections import deque
from itertools import chain
from typing import Callable, Deque, List, Optional, Union

import lxml.html
import selectolax.parser as slp

ElementReplacement = Optional[Union[str, slp.Node, List[slp.Node]]]

# https://developer.mozilla.org/en-US/docs/Glossary/Void_element
VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
}


def traverse_and_execute(
    html: str, fn: Callable[[lxml.html.HtmlElement], None]
) -> None:
    elements = lxml.html.fragments_fromstring(html)

    # If there's leading text, the first element of the array will be a string.
    # We can just discard that.
    if isinstance(elements[0], str):
        del elements[0]

    for element in elements:
        for e in element.iter():
            fn(e)


def get_elements_list(html: str) -> List[slp.Node]:
    parser = slp.HTMLParser(html)

    return list(
        chain(
            parser.head.iter(include_text=True),
            parser.body.iter(include_text=True),
        )
    )


def format_attrib_value(v: Optional[str]) -> str:
    # https://html.spec.whatwg.org/multipage/parsing.html#escapingString

    if v is None:
        return ""

    return v.replace("&", "&amp;").replace('"', "&quot;").replace("\xa0", "&nbsp;")


def get_source_definition(element: slp.Node) -> str:
    attributes = (
        f'{k}="{format_attrib_value(v)}"' for k, v in element.attributes.items()
    )
    return f"<{' '.join((element.tag, *attributes))}>"


def traverse_and_replace(
    html: str, replace: Callable[[slp.Node], Union[None, str, slp.Node]]
) -> str:

    # Initialize result and work data structures
    result: Deque[str] = deque()

    initial_list = list(slp.HTMLParser(html).body.iter(include_text=True))

    count_stack: Deque[int] = deque([len(initial_list)])
    work_stack: Deque[slp.Node] = deque(reversed(initial_list))
    tail_stack: Deque[str] = deque()

    while work_stack:
        element = work_stack.pop()

        # For just a string, append to final result
        if element.tag == "-text":
            result.append(codecs.decode(element.raw_value))
        elif element.tag == "_comment":
            result.append(element.html)

        else:
            new_elements = replace(element)

            # Turn new_elements into a list containing we can process
            if new_elements is None:
                new_elements = []
            elif isinstance(new_elements, str):
                new_elements = get_elements_list(new_elements)

            if isinstance(new_elements, list):
                # Modify count stack for new elements and decrement for element that was replaced
                count_stack[-1] += len(new_elements) - 1

                # Extend and go to the next iteration
                if new_elements:
                    work_stack.extend(reversed(new_elements))

                continue

            result.append(get_source_definition(new_elements))
            # Add all children to the work stack
            children = list(new_elements.iter(include_text=True))

            if children:
                work_stack.extend(reversed(children))

            count_stack.append(len(children))
            tail_stack.append(new_elements.tag)

        # Close all closable tags
        while count_stack[-1] == 0:
            count_stack.pop()
            tail_tag = tail_stack.pop()

            if tail_tag not in VOID_ELEMENTS and tail_tag is not None:
                result.append(f"</{tail_tag}>")
        else:
            count_stack[-1] -= 1

    # No need to empty tail stack, should be empty from above.
    # If debugging, you can add the following assertions:
    #
    # assert count_stack == deque([0])
    # assert not tail_stack

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
        return e

    number = 1000
    total_time = timeit.timeit(
        lambda: traverse_and_replace(html, replace), number=number
    )
    time_per_iter = total_time / number

    print(f"${number} loops, {time_per_iter * 1000}ms per loop")

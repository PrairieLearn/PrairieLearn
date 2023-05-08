import timeit
from collections import deque
from html import escape as html_escape
from typing import Callable, Deque, List, Optional, Tuple, Union

import lxml.html

ElementReplacement = Optional[
    Union[str, lxml.html.HtmlElement, List[lxml.html.HtmlElement]]
]

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


def format_attrib_value(v: str) -> str:
    # https://html.spec.whatwg.org/multipage/parsing.html#escapingString
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("\xa0", "&nbsp;")


def get_source_definition(element: lxml.html.HtmlElement) -> str:
    attributes = (
        f'''{k}="{format_attrib_value(v)}"''' for k, v in element.attrib.items()
    )
    return f"<{' '.join((element.tag, *attributes))}>"


def traverse_and_replace(
    html: str, replace: Callable[[lxml.html.HtmlElement], ElementReplacement]
) -> str:
    # Initialize result and work data structures
    result: Deque[str] = deque()

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
            elif isinstance(new_elements, lxml.html.HtmlProcessingInstruction):
                # Handling processing instructions is necessary for elements like `<pl-graph>`
                # that produce SVG documents.
                #
                # We transform these into comments to match the behavior of the HTML spec,
                # as well as the `parse5` npm package that we use for parsing in JavaScript.
                tail = new_elements.tail
                new_elements.tail = None
                instruction = lxml.html.tostring(new_elements, encoding="unicode")
                instruction = instruction.removeprefix("<?").removesuffix("?>")
                result.append("<!--?" + instruction + "?-->")
                if tail:
                    result.append(tail)
            else:
                # Add opening tag and text
                result.append(get_source_definition(new_elements))

                if new_elements.text is not None:
                    result.append(html_escape(new_elements.text))

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

            if tail_tag not in VOID_ELEMENTS and tail_tag is not None:
                result.append(f"</{tail_tag}>")
            if tail_text is not None:
                result.append(tail_text)
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

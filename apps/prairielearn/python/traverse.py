from collections import deque
from html import escape as html_escape
from itertools import chain
from typing import Callable, Deque, List, Optional, Tuple, Union

import lxml.html

ElementReplacement = Optional[
    Union[str, lxml.html.HtmlElement, List[lxml.html.HtmlElement]]
]

# https://developer.mozilla.org/en-US/docs/Glossary/Void_element
VOID_ELEMENTS = frozenset(
    {
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
)

UNESCAPED_ELEMENTS = frozenset({"script", "style"})


def traverse_and_execute(
    html: str, fn: Callable[[lxml.html.HtmlElement], None]
) -> None:
    elements = lxml.html.fragments_fromstring(html)

    # If there's leading text, the first element of the array will be a string.
    # We can just discard that.
    if isinstance(elements[0], str):
        del elements[0]

    for e in chain.from_iterable(element.iter() for element in elements):
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
    """
    Perform traversal and element replacement on HTML with the given replace function.
    In short, uses stacks to track what has been parsed already and what still needs to be parsed.
    The count_stack tracks how many children each unclosed tag (contained in the tail_stack) has.
    The top entry in count_stack is decremented every time something is moved onto result,
    and when an entry hits zero, the corresponding tag from tail_stack is moved onto result as well.
    """

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
                instruction = (
                    lxml.html.tostring(new_elements, encoding="unicode")
                    .removeprefix("<?")
                    .removesuffix("?>")
                )
                result.append(f"<!--?{instruction}?-->")
                if tail:
                    result.append(tail)
            else:
                # Add opening tag and text
                result.append(get_source_definition(new_elements))
                if new_elements.text is not None:
                    if new_elements.tag in UNESCAPED_ELEMENTS:
                        result.append(new_elements.text)
                    else:
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

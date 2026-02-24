from collections import deque
from collections.abc import Callable, Sequence
from html import escape as html_escape
from html import unescape as html_unescape
from itertools import chain

import lxml.html

ElementReplacement = str | lxml.html.HtmlElement | list[lxml.html.HtmlElement] | None

# https://developer.mozilla.org/en-US/docs/Glossary/Void_element
VOID_ELEMENTS = frozenset({
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
})

UNESCAPED_ELEMENTS = frozenset({"script", "style"})


def traverse_and_execute(
    html: str, fn: Callable[[lxml.html.HtmlElement], None]
) -> None:
    elements = lxml.html.fragments_fromstring(html)

    for e in chain.from_iterable(
        element.iter()
        for element in elements
        # If there's leading text, the first element of the array will be a string.
        # We can just discard that.
        if isinstance(element, lxml.html.HtmlElement)
    ):
        fn(e)


def format_attrib_value(v: str) -> str:
    # https://html.spec.whatwg.org/multipage/parsing.html#escapingString
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("\xa0", "&nbsp;")


def get_source_definition(
    element: lxml.html.HtmlElement,
    attribute_filter: Sequence[str] | None = None,
) -> str:
    if not isinstance(element.tag, str):
        raise TypeError(f"Invalid tag type: {type(element.tag)}")

    attributes = (
        f'''{k}="{format_attrib_value(v)}"'''
        for k, v in element.attrib.items()
        if attribute_filter is None or k in attribute_filter
    )
    return f"<{' '.join((element.tag, *attributes))}>"


# `lxml` uses `libxml2` under the hood, which does not support the full set
# of HTML5 named entities:
# https://gitlab.gnome.org/GNOME/libxml2/-/issues/857
# This means that with a naive approach, we'd end up double escaping entities
# like `&langle;` into `&amp;langle;`. To work around this (at least until
# `libxml2` hopefully adds support for HTML5 named entities), we first
# unescape the text to get the actual Unicode characters, and then escape them
# again. Escaping will only escape `&`, `<`, and `>`; it won't escape everything
# that could possibly be represented by a named entity.
def prepare_text(text: str) -> str:
    return html_escape(html_unescape(text))


def traverse_and_replace(
    html: str, replace: Callable[[lxml.html.HtmlElement], ElementReplacement]
) -> str:
    """
    Perform traversal and element replacement on HTML with the given replace function.
    In short, uses stacks to track what has been parsed already and what still needs to be parsed.
    The count_stack tracks how many children each unclosed tag (contained in the tail_stack) has.
    The top entry in count_stack is decremented every time something is moved onto result,
    and when an entry hits zero, the corresponding tag from tail_stack is moved onto result as well.

    Raises:
        TypeError: If the HTML contains an invalid tag.
    """
    # Initialize result and work data structures
    result: deque[str] = deque()

    initial_list = lxml.html.fragments_fromstring(html)
    count_stack: deque[int] = deque([len(initial_list)])
    work_stack: deque[str | lxml.html.HtmlElement] = deque(reversed(initial_list))
    tail_stack: deque[tuple[str, str | None]] = deque()

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
                new_elements = fragments

            if isinstance(new_elements, list):
                # Add element tail before processing replaced element
                if element.tail is not None:
                    count_stack[-1] += 1
                    work_stack.append(element.tail)

                # If there are new elements, extend and go to the next iteration
                if len(new_elements) > 0:
                    # Modify count stack for new elements and decrement for element that was replaced
                    count_stack[-1] += len(new_elements) - 1
                    work_stack.extend(reversed(new_elements))
                    continue

            elif isinstance(new_elements, lxml.html.HtmlComment):
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
                    lxml.html
                    .tostring(new_elements, encoding="unicode")
                    .removeprefix("<?")
                    .removesuffix("?>")
                )
                result.append(f"<!--?{instruction}?-->")
                if tail:
                    result.append(prepare_text(tail))
            else:
                if not isinstance(new_elements.tag, str):
                    raise TypeError(f"Invalid tag type: {type(new_elements.tag)}")

                # Add opening tag and text
                result.append(get_source_definition(new_elements))
                if new_elements.text is not None:
                    if new_elements.tag in UNESCAPED_ELEMENTS:
                        result.append(new_elements.text)
                    else:
                        result.append(prepare_text(new_elements.text))

                # Add all children to the work stack
                children = list(new_elements)

                if children:
                    work_stack.extend(reversed(children))

                count_stack.append(len(children))
                tail_stack.append((
                    new_elements.tag,
                    prepare_text(element.tail) if element.tail is not None else None,
                ))

        # Close all closable tags
        while count_stack[-1] == 0:
            count_stack.pop()
            tail_tag, tail_text = tail_stack.pop()

            if tail_tag not in VOID_ELEMENTS:
                result.append(f"</{tail_tag}>")
            if tail_text is not None:
                result.append(tail_text)

        count_stack[-1] -= 1

    # No need to empty tail stack, should be empty from above.
    # If debugging, you can add the following assertions:
    #
    # assert count_stack == deque([0])
    # assert not tail_stack

    return "".join(result)

from typing import Union, Set

import lxml.html

from traverse import traverse_and_replace


# def resolve_element(element_name: str, context: dict) -> dict:
#     if element_name in context["course_elements"]:
#         return context["course_elements"][element_name]
#     elif element_name in context["c_elements"]:



def render(data: dict, context: dict) -> str:
    # This will be a string consisting of `question.html` with Mustache templating applied.
    html = context["html"]

    # This will be a dict mapping an element name to information about them.
    elements = context["elements"]

    # This will track which elements have been rendered.
    rendered_elements: Set[str] = set()

    def render_element(element: lxml.html.HtmlElement) -> Union[str, None]:
        if element.tag not in elements:
            return None

        rendered_elements.add(element.tag)

        if element.tag == "pl-question-panel":
            return "<p>Question panel</p>"
        elif element.tag == "pl-integer-input":
            return "<p>Integer input</p>"

    return traverse_and_replace(html, render_element)

import copy
import os
import pathlib
import sys
import time
from typing import Dict, Optional, Set, Tuple, TypedDict

import lxml.html
from traverse import traverse_and_replace

PYTHON_PATH = pathlib.Path(__file__).parent.parent.resolve()
CORE_ELEMENTS_PATH = (PYTHON_PATH / "elements").resolve()
SAVED_PATH = copy.copy(sys.path)


class ElementInfo(TypedDict):
    controller: str
    type: str


class RenderContext(TypedDict):
    html: str
    """A string consisting of `question.html` with Mustache templating applied."""

    elements: Dict[str, ElementInfo]
    """A dict mapping an element name to information about them."""

    element_extensions: Dict[str, Dict[str, Dict]]
    """A dict mapping an element name to a dict of extensions for that element."""

    course_path: str


def render(data: dict, context: RenderContext) -> Tuple[str, Set[str]]:
    # This will be a string consisting of `question.html` with Mustache templating applied.
    html = context["html"]

    # This will be a dict mapping an element name to information about them.
    elements = context["elements"]

    # This will be a dict mapping an element name to a dict of extensions for that element.
    element_extensions = context["element_extensions"]

    # This will track which elements have been rendered.
    rendered_elements: Set[str] = set()

    total_time = 0

    def render_element(element: lxml.html.HtmlElement) -> Optional[str]:
        if element.tag not in elements:
            return element

        start = time.time()
        rendered_elements.add(element.tag)

        element_info = elements[element.tag]
        element_path = CORE_ELEMENTS_PATH / element_info["name"]
        element_controller = element_info["controller"]
        element_controller_path = element_path / element_controller

        # Set the element directory as the current working directory.
        os.chdir(element_path)

        # Update the path to include the appropriate directories.
        sys.path = copy.copy(SAVED_PATH)
        sys.path.insert(0, str(PYTHON_PATH))
        if element_info["type"] == "course":
            sys.path.insert(
                0, str(pathlib.Path(context["course_path"]) / "serverFilesCourse")
            )
        sys.path.insert(0, str(element_path))

        mod = {}
        with open(element_controller_path, encoding="utf-8") as inf:
            # use compile to associate filename with code object, so the
            # filename appears in the traceback if there is an error
            # (https://stackoverflow.com/a/437857)
            code = compile(inf.read(), element_controller_path, "exec")
            exec(code, mod)

        if "render" not in mod:
            return ""

        data["extensions"] = element_extensions.get(element.tag, {})
        data["client_files_element_url"] = (
            pathlib.Path(data["options"]["base_url"])
            / "elements"
            / element.tag
            / "clientFilesElement"
        ).as_posix()
        data["client_files_course_url"] = {
            extension: (
                pathlib.Path(data["options"]["base_url"])
                / "elementExtensions"
                / element.tag
                / extension
                / "clientFilesExtension"
            ).as_posix()
            for extension in data["extensions"]
        }

        element_rendered_html = mod["render"](lxml.html.tostring(element), data)

        del data["extensions"]

        end = time.time()
        delta = end - start
        nonlocal total_time
        total_time += delta
        print(f"Rendered {element.tag} in {delta * 1000}ms")

        return element_rendered_html

    rendered_html = traverse_and_replace(html, render_element)

    print(f"Total render time: {total_time * 1000}ms")

    return rendered_html, rendered_elements

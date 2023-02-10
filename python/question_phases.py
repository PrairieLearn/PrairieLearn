import copy
import os
import pathlib
import sys
import time
from typing import Dict, Optional, Set, Tuple, TypedDict

import lxml.html
from check_data import Phase, check_data
from traverse import traverse_and_execute, traverse_and_replace

PYTHON_PATH = pathlib.Path(__file__).parent.parent.resolve()
CORE_ELEMENTS_PATH = (PYTHON_PATH / "elements").resolve()
SAVED_PATH = copy.copy(sys.path)


class ElementInfo(TypedDict):
    name: str
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


def process(
    phase: Phase, data: dict, context: RenderContext
) -> Tuple[Optional[str], Set[str]]:
    # This will be a string consisting of `question.html` with Mustache templating applied.
    html = context["html"]

    # This will be a dict mapping an element name to information about them.
    elements = context["elements"]

    # This will be a dict mapping an element name to a dict of extensions for that element.
    element_extensions = context["element_extensions"]

    # This will track which elements have been rendered.
    rendered_elements: Set[str] = set()

    total_time = 0

    def process_element(element: lxml.html.HtmlElement) -> Optional[str]:
        if element.tag not in elements:
            return element

        try:
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

            if phase not in mod:
                return None

            # Make a deep copy of the data so that question/element code can't
            # modify the source data.
            data["extensions"] = copy.deepcopy(element_extensions.get(element.tag, {}))

            # `base_url` and associated values are only present during the render phase.
            if phase == "render":
                data["options"]["client_files_element_url"] = (
                    pathlib.Path(data["options"]["base_url"])
                    / "elements"
                    / element_info["name"]
                    / "clientFilesElement"
                ).as_posix()
                data["options"]["client_files_extensions_url"] = {
                    extension: (
                        pathlib.Path(data["options"]["base_url"])
                        / "elementExtensions"
                        / element_info["name"]
                        / extension
                        / "clientFilesExtension"
                    ).as_posix()
                    for extension in data["extensions"]
                }

            old_data = copy.deepcopy(data)

            # Temporarily strip tail text from the element; the `parse_fragment`
            # function will choke on it.
            temp_tail = element.tail
            element.tail = None

            element_rendered_html = mod[phase](lxml.html.tostring(element), data)

            # Restore the tail text.
            element.tail = temp_tail

            check_data(old_data, data, phase)

            end = time.time()
            delta = end - start
            nonlocal total_time
            total_time += delta
            print(f"Processed {element.tag} in {delta * 1000}ms")

            if phase == "render":
                # TODO: validate that return value was a string?
                return element_rendered_html
        except Exception:
            raise Exception(f"Error processing element {element.tag}")

    def process_element_return_none(element: lxml.html.HtmlElement) -> None:
        process_element(element)

    rendered_html = None

    if phase == "render":
        rendered_html = traverse_and_replace(html, process_element)
    else:
        traverse_and_execute(html, process_element_return_none)

    # We added an `extensions` property to the `data` object; remove it.
    del data["extensions"]

    print(f"Total process time: {total_time * 1000}ms")

    return rendered_html, rendered_elements

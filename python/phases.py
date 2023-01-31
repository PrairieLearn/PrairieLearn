from typing import Union, Set, Tuple
import pathlib
import os
import copy
import sys

import lxml.html

from traverse import traverse_and_replace

PYTHON_PATH = pathlib.Path(__file__).parent.parent.resolve()
CORE_ELEMENTS_PATH = (PYTHON_PATH / "elements").resolve()
SAVED_PATH = copy.copy(sys.path)


# def resolve_element(element_name: str, context: dict) -> dict:
#     if element_name in context["course_elements"]:
#         return context["course_elements"][element_name]
#     elif element_name in context["c_elements"]:


def render(data: dict, context: dict) -> Tuple[str, Set[str]]:
    # This will be a string consisting of `question.html` with Mustache templating applied.
    html = context["html"]

    # This will be a dict mapping an element name to information about them.
    elements = context["elements"]

    # This will be a dict mapping an element name to a dict of extensions for that element.
    element_extensions = context["element_extensions"]

    # This will track which elements have been rendered.
    rendered_elements: Set[str] = set()

    def render_element(element: lxml.html.HtmlElement) -> Union[str, None]:
        if element.tag not in elements:
            return None

        rendered_elements.add(element.tag)

        element_info = elements[element.tag]
        element_path = CORE_ELEMENTS_PATH / element.tag
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

        print(sys.path)

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

        return element_rendered_html

    rendered_html = traverse_and_replace(html, render_element)

    return rendered_html, rendered_elements

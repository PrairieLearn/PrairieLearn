import base64
import copy
import io
import os
import pathlib
import sys
from typing import Any, Literal, Optional, Tuple, TypedDict

import lxml.html
from check_data import Phase, check_data
from traverse import traverse_and_execute, traverse_and_replace
from typing_extensions import assert_never

PYTHON_PATH = pathlib.Path(__file__).parent.parent.resolve()
CORE_ELEMENTS_PATH = (PYTHON_PATH / "elements").resolve()
SAVED_PATH = copy.copy(sys.path)


class ElementInfo(TypedDict):
    name: str
    controller: str
    type: Literal["core", "course"]


class RenderContext(TypedDict):
    html: str
    """A string consisting of `question.html` with Mustache templating applied."""

    elements: dict[str, ElementInfo]
    """A dict mapping an element name to information about them."""

    element_extensions: dict[str, dict[str, dict]]
    """A dict mapping an element name to a dict of extensions for that element."""

    course_path: str
    """The path to the course directory."""


def filelike_to_string(filelike: Any) -> str:
    # if val is None, replace it with empty string
    if filelike is None:
        filelike = ""

    # if val is a file-like object, read whatever is inside
    if isinstance(filelike, io.IOBase):
        filelike.seek(0)
        filelike = filelike.read()

    # if val is a string, treat it as utf-8
    if isinstance(filelike, str):
        filelike = bytes(filelike, "utf-8")

    # if this next call does not work, it will throw an error, because
    # the thing returned by file() does not have the correct format
    return base64.b64encode(filelike).decode()


def process(
    phase: Phase, data: dict, context: RenderContext
) -> Tuple[Optional[str], set[str]]:
    html = context["html"]
    elements = context["elements"]
    course_path = context["course_path"]

    # This will track which elements have been processed.
    processed_elements: set[str] = set()

    # If we're in the `render` phase, we'll eventually capture the HTML here.
    # If we're in the `file` phase, we'll capture file data here.
    # Otherwise, this will remain `None`.
    result = None

    # Copying data is potentially expensive, and most of it won't change as we
    # process all the elements, so we'll make a deep copy of the data once and
    # use that for future comparisons. For the few pieces of data that do
    # change based on the element, we'll add and then delete them from
    # `original_data` as needed.
    original_data = copy.deepcopy(data)

    # We'll cache instantiated modules for two reasons:
    # - This allows us to avoid re-reading/compiling/executing them if the same
    #   element is used multiple times.
    # - This allows element code to maintain state across multiple calls. This is useful
    #   specifically for elements that want to maintain a cache of expensive-to-compute data.
    mod_cache: dict[pathlib.Path, dict[str, Any]] = {}

    def process_element(
        element: lxml.html.HtmlElement,
    ) -> None | str | lxml.html.HtmlElement:
        nonlocal result

        if element.tag not in elements:
            return element

        try:
            processed_elements.add(element.tag)

            element_info = elements[element.tag]
            element_type = element_info["type"]
            element_name = element_info["name"]
            if element_type == "core":
                element_path = CORE_ELEMENTS_PATH / element_name
            elif element_type == "course":
                element_path = pathlib.Path(course_path) / "elements" / element_name
            else:
                assert_never(element_type)
            element_controller = element_info["controller"]
            element_controller_path = element_path / element_controller

            # Set the element directory as the current working directory.
            os.chdir(element_path)

            # Update the path to include the appropriate directories.
            sys.path = copy.copy(SAVED_PATH)
            sys.path.insert(0, str(PYTHON_PATH))
            if element_info["type"] == "course":
                sys.path.insert(0, str(pathlib.Path(course_path) / "serverFilesCourse"))
            sys.path.insert(0, str(element_path))

            mod = mod_cache.get(element_controller_path)
            if mod is None:
                mod = {}

                with open(element_controller_path, encoding="utf-8") as inf:
                    # Use `compile` to associate filename with code object, so the
                    # filename appears in the traceback if there is an error:
                    # https://stackoverflow.com/a/437857
                    code = compile(inf.read(), element_controller_path, "exec")

                exec(code, mod)
                mod_cache[element_controller_path] = mod

            if phase not in mod:
                return None

            # Add element-specific or phase-specific information to the data.
            prepare_data(phase, data, context, element)
            prepare_data(phase, original_data, context, element)

            # Temporarily strip tail text from the element; the `parse_fragment`
            # function will choke on it.
            temp_tail = element.tail
            element.tail = None

            element_value = mod[phase](lxml.html.tostring(element), data)

            # Restore the tail text.
            element.tail = temp_tail

            check_data(original_data, data, phase)

            # Clean up changes to `data` and `original_data` for the next iteration.
            restore_data(data)
            restore_data(original_data)

            if phase == "render":
                # TODO: validate that return value was a string?
                return element_value
            elif phase == "file":
                if result is not None:
                    raise Exception("Another element already returned a file")
                result = element_value
            else:
                if element_value is not None and element_value is not data:
                    # TODO: Once this has been running in production for a while,
                    # change this to raise an exception.
                    sys.stderr.write(
                        f"Function {str(phase)}() in {str(element_controller)} returned a data object other than the one that was passed in.\n\n"
                        + "There is no need to return a value, as the data object is mutable and can be modified in place.\n\n"
                        + "For now, the return value will be used instead of the data object that was passed in.\n\n"
                        + "In the future, returning a different object will trigger a fatal error."
                    )
        except Exception:
            raise Exception(f"Error processing element {element.tag}")

    def process_element_return_none(element: lxml.html.HtmlElement) -> None:
        process_element(element)

    if phase == "render":
        result = traverse_and_replace(html, process_element)
    else:
        traverse_and_execute(html, process_element_return_none)

    if phase == "file":
        result = filelike_to_string(result)

    return result, processed_elements


def prepare_data(
    phase: Phase, data: dict, context: RenderContext, element: lxml.html.HtmlElement
) -> None:
    element_extensions = context["element_extensions"]
    element_info = context["elements"][element.tag]

    # Make a deep copy of the data so that question/element code can't
    # modify the source data.
    data["extensions"] = copy.deepcopy(element_extensions.get(element.tag, {}))

    # `*_url` options are only present during the render phase.
    if phase == "render":
        client_files_element_url = (
            pathlib.Path(data["options"]["course_element_files_url"])
            / element_info["name"]
            / "clientFilesElement"
        ).as_posix()
        client_files_extensions_url = {
            extension: (
                pathlib.Path(data["options"]["course_element_extension_files_url"])
                / element_info["name"]
                / extension
                / "clientFilesExtension"
            ).as_posix()
            for extension in data["extensions"]
        }

        data["options"]["client_files_element_url"] = client_files_element_url
        data["options"]["client_files_extensions_url"] = client_files_extensions_url


def restore_data(data: dict) -> None:
    data.pop("extensions", None)
    data["options"].pop("client_files_element_url", None)
    data["options"].pop("client_files_extensions_url", None)

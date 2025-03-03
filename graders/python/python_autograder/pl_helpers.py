import base64
import io
import os
import urllib
from collections.abc import Callable
from functools import wraps
from os.path import join, splitext
from types import ModuleType
from typing import IO, Any, TypeVar

import pygments
from code_feedback import Feedback
from pygments.formatters import Terminal256Formatter
from pygments.lexers import PythonLexer


class DoNotRunError(Exception):
    pass


class GradingSkipped(Exception):  # noqa: N818
    pass


def extract_ipynb_contents(f: IO[str], ipynb_key: str) -> str:
    from IPython.core.interactiveshell import InteractiveShell  # type: ignore
    from nbformat import read  # type: ignore

    """
    Extract all cells from a ipynb notebook that start with a given
    delimiter
    """

    nb = read(f, 4)
    shell = InteractiveShell.instance()
    content = ""
    for cell in nb.cells:
        if cell["cell_type"] == "code":
            code = shell.input_transformer_manager.transform_cell(cell.source)
            if code.strip().startswith(ipynb_key):
                content += code
    return content


def save_plot(plt: ModuleType, iternum: int = 0) -> None:
    """
    Save plot(s) to files as png images.
    """
    base_dir = os.environ.get("MERGE_DIR")
    if base_dir is None:
        raise ValueError("MERGE_DIR not set in environment variables")

    for i in plt.get_fignums():
        plt.figure(i)
        fig = plt.gcf()
        imgdata = io.BytesIO()
        fig.savefig(imgdata, format="png")
        imgdata.seek(0)
        imgsrc = "data:image/png;base64," + urllib.parse.quote(  # type: ignore
            base64.b64encode(imgdata.read())
        )
        with open(join(base_dir, f"image_{iternum}_{i - 1}.png"), "w") as f:
            f.write(imgsrc)


def points(points: float) -> Callable[..., Callable[..., Any]]:
    """
    Set the number of points that a test case should award.
    """
    T = TypeVar("T")

    def decorator(f: Callable[..., T]) -> Callable[..., T]:
        f.__dict__["points"] = points
        return f

    return decorator


def name(name: str) -> Callable[..., Callable[..., None]]:
    """
    Set the name of a test case, this will appear on the "results" tab.
    """
    T = TypeVar("T")

    def decorator(f: Callable[..., T]) -> Callable[..., None]:
        @wraps(f)
        def wrapped(test_instance: Any) -> None:
            Feedback.set_name(f.__name__)
            if test_instance.total_iters > 1 and getattr(
                test_instance, "print_iteration_prefix", True
            ):
                Feedback.add_iteration_prefix(test_instance.iter_num)
            f(test_instance)

        wrapped.__dict__["name"] = name
        return wrapped

    return decorator


def not_repeated(f: Callable[..., Any]) -> Callable[..., None]:
    """
    Marks this test as running only once, if the test suite is to be run multiple times.
    """

    @wraps(f)
    def wrapped(test_instance: Any) -> None:
        # test_instance should be typed as PLTestCase if there was no circular import
        if test_instance.iter_num > 0:
            raise DoNotRunError
        Feedback.clear_iteration_prefix()
        test_instance.print_iteration_prefix = False
        f(test_instance)

    wrapped.__repeated__ = False  # type: ignore
    return wrapped


def print_student_code(
    st_code: str = "user_code.py",
    ipynb_key: str = "#grade",
    as_feedback: bool = True,  # noqa: FBT001
) -> None | str:
    """
    Print the student's code, with syntax highlighting.
    """

    with open(st_code, encoding="utf-8") as f:
        _, extension = splitext(st_code)
        if extension == ".ipynb":
            contents = extract_ipynb_contents(f, ipynb_key).strip()
            lines = filter(
                lambda item: not item.strip().startswith(ipynb_key),
                contents.split("\n"),
            )
            contents = "\n".join(lines)
        else:
            contents = f.read().strip()
        formatted = pygments.highlight(
            contents, PythonLexer(), Terminal256Formatter(style="monokai")
        )
        if as_feedback:
            Feedback.add_feedback(formatted)
        else:
            return formatted

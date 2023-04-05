import base64
import io
import os
import urllib
from functools import wraps
from os.path import join, splitext

import pygments
from code_feedback import Feedback
from IPython.core.interactiveshell import InteractiveShell
from nbformat import read
from pygments.formatters import Terminal256Formatter
from pygments.lexers import PythonLexer


class DoNotRun(Exception):
    pass


class GradingSkipped(Exception):
    pass


def extract_ipynb_contents(f, ipynb_key):
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


def save_plot(plt, iternum=0):
    """
    Save plot(s) to files as png images.
    """
    base_dir = os.environ.get("MERGE_DIR")

    for i in plt.get_fignums():
        plt.figure(i)
        fig = plt.gcf()
        imgdata = io.BytesIO()
        fig.savefig(imgdata, format="png")
        imgdata.seek(0)
        imgsrc = "data:image/png;base64," + urllib.parse.quote(
            base64.b64encode(imgdata.read())
        )
        with open(join(base_dir, f"image_{iternum}_{i - 1}.png"), "w") as f:
            f.write(imgsrc)


def points(points):
    """
    Set the number of points that a test case should award.
    """

    def decorator(f):
        f.__dict__["points"] = points
        return f

    return decorator


def name(name):
    """
    Set the name of a test case, this will appear on the "results" tab.
    """

    def decorator(f):
        @wraps(f)
        def wrapped(Test_instance):
            Feedback.set_name(f.__name__)
            if Test_instance.total_iters > 1 and getattr(
                Test_instance, "print_iteration_prefix", True
            ):
                Feedback.add_iteration_prefix(Test_instance.iter_num)
            f(Test_instance)

        wrapped.__dict__["name"] = name
        return wrapped

    return decorator


def not_repeated(f):
    """
    Marks this test as running only once, if the test suite is to be run multiple times.
    """

    @wraps(f)
    def wrapped(Test_instance):
        if Test_instance.iter_num > 0:
            raise DoNotRun
        Feedback.clear_iteration_prefix()
        Test_instance.print_iteration_prefix = False
        f(Test_instance)

    wrapped.__repeated__ = False
    return wrapped


def print_student_code(st_code="user_code.py", ipynb_key="#grade", as_feedback=True):
    """
    Print the student's code, with syntax highlighting.
    """

    with open(st_code, "r", encoding="utf-8") as f:
        filename, extension = splitext(st_code)
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

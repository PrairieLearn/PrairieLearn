import io
import urllib
import base64
import os
from os.path import join
from functools import wraps
from code_feedback import Feedback
import pygments
from pygments.lexers import PythonLexer
from pygments.formatters import Terminal256Formatter


class DoNotRun(Exception):
    pass


def save_plot(plt, iternum=0):
    """
    Save plot(s) to files as png images.
    """
    base_dir = os.environ.get("MERGE_DIR")

    for i in plt.get_fignums():
        plt.figure(i)
        fig = plt.gcf()
        imgdata = io.BytesIO()
        fig.savefig(imgdata, format='png')
        imgdata.seek(0)
        imgsrc = 'data:image/png;base64,' + \
                 urllib.parse.quote(base64.b64encode(imgdata.read()))
        with open(join(base_dir, f'image_{iternum}_{i - 1}.png'), 'w') as f:
            f.write(imgsrc)


def points(points):
    """
    Set the number of points that a test case should award.
    """

    def decorator(f):
        f.__dict__['points'] = points
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
            if (Test_instance.total_iters > 1 and
               getattr(Test_instance, 'print_iteration_prefix', True)):
                Feedback.add_iteration_prefix(Test_instance.iter_num)
            f(Test_instance)
        wrapped.__dict__['name'] = name
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


def print_student_code(st_code='user_code.py', as_feedback=True):
    """
    Print the student's code, with syntax highlighting.
    """

    with open(st_code, 'r', encoding='utf-8') as f:
        contents = f.read().strip()
        formatted = pygments.highlight(contents, PythonLexer(), Terminal256Formatter(style='monokai'))
        if as_feedback:
            Feedback.add_feedback(formatted)
        else:
            return formatted

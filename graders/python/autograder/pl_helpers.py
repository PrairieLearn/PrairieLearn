import io
import urllib
import base64
from functools import wraps
from code_feedback import Feedback


class DoNotRun(Exception):
    pass


def save_plot(plt, iternum=0):
    for i in plt.get_fignums():
        plt.figure(i)
        fig = plt.gcf()
        imgdata = io.BytesIO()
        fig.savefig(imgdata, format='png')
        imgdata.seek(0)
        imgsrc = 'data:image/png;base64,' + \
                 urllib.parse.quote(base64.b64encode(imgdata.read()))
        with open("image_%d_%d.png" % (iternum, i - 1), 'w') as f:
            f.write(imgsrc)


def points(points):
    def decorator(f):
        f.__dict__['points'] = points
        return f
    return decorator


def name(name):
    def decorator(f):
        @wraps(f)
        def wrapped(Test_instance):
            Feedback.set_name(name)
            if (Test_instance.total_iters > 1 and
               getattr(Test_instance, 'print_iteration_prefix', True)):
                Feedback.add_iteration_prefix(Test_instance.iter_num)
            f(Test_instance)
        wrapped.__dict__['name'] = name
        return wrapped
    return decorator


def not_repeated(f):
    @wraps(f)
    def wrapped(Test_instance):
        if Test_instance.iter_num > 0:
            raise DoNotRun
        Feedback.clear_iteration_prefix()
        Test_instance.print_iteration_prefix = False
        f(Test_instance)
    wrapped.__repeated__ = False
    return wrapped


def print_student_code(st_code='user_code.py'):
    with open(st_code, 'r', encoding='utf-8') as f:
        Feedback.add_feedback(f.read())

# -*- coding: utf-8 -*-

from __future__ import division, print_function

__copyright__ = "Copyright (C) 2014 Andreas Kloeckner"

__license__ = """
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
"""


class GradingComplete(Exception):
    pass


class Feedback:
    test_name = None
    prefix_message = "\nFeedback for case %d\n---------------------\n"
    buffer = ''

    @classmethod
    def set_name(cls, name):
        cls.test_name = name
        cls.buffer = ''

    @classmethod
    def set_test(cls, test):
        cls.test = test

    @classmethod
    def set_points(cls, points):
        cls.test.points = points

    @classmethod
    def add_iteration_prefix(cls, iter_prefix):
        cls.buffer = cls.prefix_message % iter_prefix

    @classmethod
    def clear_iteration_prefix(cls):
        cls.buffer = ''

    @classmethod
    def add_feedback(cls, text):
        with open("/grade/run/feedback_" + cls.test_name + ".txt", 'a+',
                  encoding='utf-8') as f:
            f.write(cls.buffer + text)
            f.write('\n')
            cls.buffer = ''

    @classmethod
    def finish(cls, fb_text):
        cls.add_feedback(fb_text)
        raise GradingComplete()

    @classmethod
    def check_numpy_array_sanity(cls, name, num_axes, data):
        import numpy as np
        if data is None:
            cls.finish("'%s' is None or not defined" % name)

        if not isinstance(data, np.ndarray):
            cls.finish("'%s' is not a numpy array" % name)

        if isinstance(data, np.matrix):
            cls.finish("'%s' is a numpy matrix. Do not use those. "
                    "bit.ly/array-vs-matrix" % name)

        if len(data.shape) != num_axes:
            cls.finish(
                    "'%s' does not have the correct number of axes--"
                    "got: %d, expected: %d" % (
                        name, len(data.shape), num_axes))

        if data.dtype.kind not in "fc":
            cls.finish(
                    "'%s' does not consist of floating point numbers--"
                    "got: '%s'" % (name, data.dtype))

    @classmethod
    def check_numpy_array_features(cls, name, ref, data,
                                   accuracy_critical=True,
                                   report_failure=True):
        import numpy as np

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish('')
            else:
                return False

        if data is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(data, np.ndarray):
            return bad("'%s' is not a numpy array" % name)

        if isinstance(data, np.matrix):
            return bad("'%s' is a numpy matrix. Do not use those. "
                    "bit.ly/array-vs-matrix" % name)

        if ref.shape != data.shape:
            return bad(
                    "'%s' does not have correct shape--"
                    "got: '%s', expected: '%s'" % (
                        name, data.shape, ref.shape))

        if ref.dtype.kind != data.dtype.kind:
            return bad(
                    "'%s' does not have correct data type--"
                    "got: '%s', expected: '%s'" % (
                        name, data.dtype, ref.dtype))

        return True

    @classmethod
    def check_numpy_array_allclose(cls, name, ref, data, accuracy_critical=True,
            rtol=1e-05, atol=1e-08, report_success=True, report_failure=True):
        import numpy as np

        if not cls.check_numpy_array_features(name, ref, data,
                accuracy_critical, report_failure):
            return False

        good = np.allclose(ref, data, rtol=rtol, atol=atol)

        if not good:
            if report_failure:
                cls.add_feedback("'%s' is inaccurate" % name)
        else:
            if report_success:
                cls.add_feedback("'%s' looks good" % name)

        if accuracy_critical and not good:
            raise GradingComplete()

        return good


    @classmethod
    def check_list_features(cls, name, ref, data, entry_type=None,
                                   accuracy_critical=True,
                                   report_failure=True):
        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)
            if accuracy_critical:
                cls.finish('')
            else:
                return False

        if data is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(data, list):
            return bad("'%s' is not a list" % name)

        if len(ref) != len(data):
            return bad("'%s' has the wrong length--expected %d, got %d"
              % (name, len(ref), len(data)))

        if entry_type is not None:
            for i, entry in enumerate(data):
                if not isinstance(entry, entry_type):
                    return bad("'%s[%d]' has the wrong type" % (name, i))

        return True

    @classmethod
    def check_list(cls, name, ref, data, entry_type=None):

        if data is None:
            cls.finish("'%s' is None or not defined" % name)

        if not isinstance(data, list):
            cls.finish("'%s' is not a list" % name)

        if len(ref) != len(data):
            cls.finish("'%s' has the wrong length--expected %d, got %d"
              % (name, len(ref), len(data)))

        if entry_type is not None:
            for i, entry in enumerate(data):
                if not isinstance(entry, entry_type):
                    cls.finish("'%s[%d]' has the wrong type" % (name, i))

    @classmethod
    def check_tuple(cls, name, ref, data, accuracy_critical=True,
            report_failure=True, report_success=True):

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish('')
            else:
                return False

        if data is None:
            return bad("{} is None or not defined".format(name))

        if not isinstance(data, tuple):
            return bad("{} is not a tuple".format(name))

        nref = len(ref)
        if len(data) != nref:
            return bad("{} should be of length {}".format(name, nref))

        good = True
        for i in range(nref):
            if type(data[i]) != type(ref[i]):
                good = False
                if report_failure:
                    cls.add_feedback("{}[{}] should be of type {}".format(name,
                            i, type(ref[i]).__name__))
            elif data[i] != ref[i]:
                good = False

        if not good:
            return bad("'%s' is inaccurate" % name)
        else:
            if report_success:
                cls.add_feedback("'%s' looks good" % name)

        return True

    @classmethod
    def check_scalar(cls, name, ref, data, accuracy_critical=True,
            rtol=1e-5, atol=1e-8, report_success=True, report_failure=True):
        import numpy as np

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish('')
            else:
                return False

        if data is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(data, (complex, float, int, np.number)):
            try:
                # Check whether data is a sympy number because sympy
                # numbers do not follow the typical interface
                # See https://github.com/inducer/relate/pull/284
                if not data.is_number:
                    return bad("'%s' is not a number" % name)
            except AttributeError:
                return bad("'%s' is not a number" % name)

        good = False

        if rtol is not None and abs(ref-data) < abs(ref)*rtol:
            good = True
        if atol is not None and abs(ref-data) < atol:
            good = True

        if not good:
            return bad("'%s' is inaccurate" % name)
        else:
            if report_success:
                cls.add_feedback("'%s' looks good" % name)

        return True

    @classmethod
    def call_user(cls, f, *args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            if callable(f):
                try:
                    callable_name = f.__name__
                except Exception as e_name:
                    callable_name = (
                                "<unable to retrieve name; encountered %s: %s>"
                                % (
                                    type(e_name).__name__,
                                    str(e_name)))
                from traceback import format_exc
                cls.add_feedback(
                        "The callable '%s' supplied in your code failed with "
                        "an exception while it was being called by the grading "
                        "code:"
                        "%s"
                        % (
                            callable_name,
                            "".join(format_exc())))
            else:
                cls.add_feedback(
                        "Your code was supposed to supply a function or "
                        "callable, but the variable you supplied was not "
                        "callable.")

            raise GradingComplete()

    @classmethod
    def check_plot(cls, name, ref, plot, check_axes_scale=None):
        import numpy as np
        import matplotlib.axes

        if plot is None:
            cls.add_feedback("'%s' is None or not defined" % name)
            return False

        if not isinstance(plot, matplotlib.axes.Axes):
            cls.add_feedback("'%s' is not an object of matplotlib axes" % name)
            return False

        # check_axes_scale can be None, 'x', 'y', or 'xy'
        if check_axes_scale:
            scales_match = True

            if 'x' in check_axes_scale:
                xscale = plot.get_xscale()
                ref_xscale = ref.get_xscale()
                if xscale != ref_xscale:
                    scales_match = False

            if 'y' in check_axes_scale:
                yscale = plot.get_yscale()
                ref_yscale = ref.get_yscale()
                if yscale != ref_yscale:
                    scales_match = False

            if not scales_match:
                cls.add_feedback(("'%s' does not have the correct"
                                  " scale for its axes" % name))
                return False

        user_lines = plot.get_lines()
        ref_lines = ref.get_lines()

        if user_lines is None:
            cls.add_feedback("No lines were plotted in '%s'" % name)
            return False

        if len(user_lines) != len(ref_lines):
            cls.add_feedback("%d lines were plotted in '%s' but %d lines were "
                             "expected"
                             % (len(user_lines), name, len(ref_lines)))
            return False

        ref_datas = {}
        for i, ref_line in enumerate(ref_lines):
            ref_data = np.array([ref_line.get_data()[0], ref_line.get_data()[1]])
            ref_data = ref_data[np.lexsort(ref_data.T)]
            ref_datas[i] = ref_data

        num_correct = 0
        for i, line in enumerate(user_lines):
            data = np.array([line.get_data()[0], line.get_data()[1]])
            data = data[np.lexsort(data.T)]
            for j, ref_data in ref_datas.items():
                if data.shape == ref_data.shape and np.allclose(data, ref_data):
                    num_correct += 1
                    del[ref_datas[j]]
                    break

        if num_correct == len(ref_lines):
            cls.add_feedback("'%s' looks good" % name)
            return True
        else:
            cls.add_feedback("'%s' is inaccurate" % name)
            return False

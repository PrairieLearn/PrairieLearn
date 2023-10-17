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
    """
    Class to provide user feedback and correctness checking of various datatypes, including NumPy arrays, Matplotlib plots, and Pandas DataFrames.
    """

    test_name = None
    feedback_file = None
    prefix_message = "\nFeedback for case %d\n---------------------\n"
    buffer = ""

    @classmethod
    def set_name(cls, name):
        cls.test_name = name
        cls.feedback_file = "feedback_" + name
        cls.buffer = ""

    @classmethod
    def set_main_output(cls):
        cls.test_name = "output"
        cls.feedback_file = "output"
        cls.buffer = ""

    @classmethod
    def set_test(cls, test):
        cls.test = test

    @classmethod
    def set_score(cls, score):
        """
        Feedback.set_score(percentage)

        Set the score for the test case, should be a floating point value between 0 and 1.
        """
        if score < 0:
            score = 0.0
        elif score > 1:
            score = 1.0

        cls.test.points = score

    @classmethod
    def add_iteration_prefix(cls, iter_prefix):
        cls.buffer = cls.prefix_message % iter_prefix

    @classmethod
    def clear_iteration_prefix(cls):
        cls.buffer = ""

    @classmethod
    def add_feedback(cls, text):
        """
        Feedback.add_feedback(text)

        Adds some text to the feedback output for the current test.
        """
        with open(
            "/grade/run/" + cls.feedback_file + ".txt", "a+", encoding="utf-8"
        ) as f:
            f.write(cls.buffer + text)
            f.write("\n")
            cls.buffer = ""

    @classmethod
    def finish(cls, fb_text):
        """
        Feedback.finish(fb_text)

        Complete grading immediately, additionally outputting the message in fb_text.
        """
        cls.add_feedback(fb_text)
        raise GradingComplete()

    @staticmethod
    def not_allowed(*args, **kwargs):
        """
        library_function = Feedback.not_allowed

        Used to hook into disallowed functions, raises an exception if
        the student tries to call it.
        """
        raise RuntimeError("The use of this function is not allowed.")

    @classmethod
    def check_numpy_array_sanity(cls, name, num_axes, data):
        """
        Feedback.check_numpy_array_sanity(name, num_axes, data)

        Perform a sanity check on a NumPy array, making sure that it is in fact defined and has the correct dimensionality.  If the checks fail then grading will automatically stop.

        - ``name``: Name of the array that is being checked.  This will be used to give feedback.
        - ``num_axes``: Number of axes that the array should have.
        - ``data``: NumPy array to check.
        """

        import numpy as np

        if data is None:
            cls.finish("'%s' is None or not defined" % name)

        if not isinstance(data, np.ndarray):
            cls.finish("'%s' is not a numpy array" % name)

        if isinstance(data, np.matrix):
            cls.finish(
                "'%s' is a numpy matrix. Do not use those. "
                "bit.ly/array-vs-matrix" % name
            )

        if len(data.shape) != num_axes:
            cls.finish(
                "'%s' does not have the correct number of axes--"
                "got: %d, expected: %d" % (name, len(data.shape), num_axes)
            )

        if data.dtype.kind not in "fc":
            cls.finish(
                "'%s' does not consist of floating point numbers--"
                "got: '%s'" % (name, data.dtype)
            )

    @classmethod
    def check_numpy_array_features(
        cls, name, ref, data, accuracy_critical=False, report_failure=True
    ):
        """
        Feedback.check_numpy_array_features(name, ref, data)

        Check that a student NumPy array has the same shape and datatype as a  reference solution NumPy array.

        - ``name``: Name of the array that is being checked.  This will be used to give feedback.
        - ``ref``: Reference NumPy array.
        - ``data``: Student NumPy array to be checked.  Do not mix this up with the previous array! This argument is subject to more strict type checking.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``report_failure``: If true, feedback will be given on failure.
        """
        import numpy as np

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(data, np.ndarray):
            return bad("'%s' is not a numpy array" % name)

        if isinstance(data, np.matrix):
            return bad(
                "'%s' is a numpy matrix. Do not use those. "
                "bit.ly/array-vs-matrix" % name
            )

        if ref.shape != data.shape:
            return bad(
                "'%s' does not have correct shape--"
                "got: '%s', expected: '%s'" % (name, data.shape, ref.shape)
            )

        if ref.dtype.kind != data.dtype.kind:
            return bad(
                "'%s' does not have correct data type--"
                "got: '%s', expected: '%s'" % (name, data.dtype, ref.dtype)
            )

        return True

    @classmethod
    def check_numpy_array_allclose(
        cls,
        name,
        ref,
        data,
        accuracy_critical=False,
        rtol=1e-05,
        atol=1e-08,
        report_success=True,
        report_failure=True,
    ):
        """
        Feedback.check_numpy_allclose(name, ref, data)

        Check that a student NumPy array has similar values to a reference NumPy array. Note that this checks value according to the numpy.allclose function, which goes  by the following check:
        ``absolute(a - b) <= (atol + rtol * absolute(b))``

        - ``name``: Name of the array that is being checked.  This will be used to give feedback.
        - ``ref``: Reference NumPy array.
        - ``data``: Student NumPy array to be checked.  Do not mix this up with the previous array! This argument is subject to more strict type checking.
        - ``rtol``: Maximum relative tolerance between values.
        - ``atol``: Maximum absolute tolerance between values.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``report_failure``: If true, feedback will be given on failure.
        """

        import numpy as np

        if not cls.check_numpy_array_features(
            name, ref, data, accuracy_critical, report_failure
        ):
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
    def check_list(
        cls,
        name,
        ref,
        data,
        entry_type=None,
        accuracy_critical=False,
        report_failure=True,
    ):
        """
        Feedback.check_list(name, ref, data)

        Check that a student list has correct length with respect to a reference list.  Can also check for a homogeneous data type for the list.

        - ``name``: Name of the list that is being checked.  This will be used to give feedback.
        - ``ref``: Reference list.
        - ``data``: Student list to be checked.  Do not mix this up with the previous list! This argument is subject to more strict type checking.
        - ``entry_type``: If not None, requires that each element in the student solution be of this type.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``report_failure``: If true, feedback will be given on failure.
        """

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)
            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(data, list):
            return bad("'%s' is not a list" % name)

        if len(ref) != len(data):
            return bad(
                "'%s' has the wrong length--expected %d, got %d"
                % (name, len(ref), len(data))
            )

        if entry_type is not None:
            for i, entry in enumerate(data):
                if not isinstance(entry, entry_type):
                    return bad("'%s[%d]' has the wrong type" % (name, i))

        return True

    @classmethod
    def check_tuple(
        cls,
        name,
        ref,
        data,
        accuracy_critical=False,
        report_failure=True,
        report_success=True,
    ):
        """
        Feedback.check_tuple(name, ref, data)

        Check that a student tuple has correct length with respect to a reference tuple, and same values.

        - ``name``: Name of the tuple that is being checked.  This will be used to give feedback.
        - ``ref``: Reference tuple.
        - ``data``: Student tuple to be checked.  Do not mix this up with the previous tuple! This argument is subject to more strict type checking.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``report_failure``: If true, feedback will be given on failure.
        - ``report_success``: If true, feedback will be given on success.
        """

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
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
            if type(data[i]) != type(ref[i]):  # noqa: E721
                good = False
                if report_failure:
                    cls.add_feedback(
                        "{}[{}] should be of type {}".format(
                            name, i, type(ref[i]).__name__
                        )
                    )
            elif data[i] != ref[i]:
                good = False

        if not good:
            return bad("'%s' is inaccurate" % name)
        else:
            if report_success:
                cls.add_feedback("'%s' looks good" % name)

        return True

    @classmethod
    def check_scalar(
        cls,
        name,
        ref,
        data,
        accuracy_critical=False,
        rtol=1e-5,
        atol=1e-8,
        report_success=True,
        report_failure=True,
    ):
        """
        Feedback.check_scalar(name, ref, data)

        Check that a student scalar has correct value with respect to a reference scalar. This will mark a value as correct if it passes any of the following checks:

        - ``abs(ref - data) < ref(ref) * rtol``
        - ``abs(ref - data) < atol``

        One of rtol or atol can be omitted (set to None) if that check is unwanted.
        Or both, but then nothing would be graded :)

        - ``name``: Name of the scalar that is being checked.  This will be used to give feedback.
        - ``ref``: Reference scalar.
        - ``data``: Student scalar to be checked.  Do not mix this up with the previous value! This argument is subject to more strict type checking.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``rtol``: Maximum relative tolerance.
        - ``atol``: Maximum absolute tolerance.
        - ``report_failure``: If true, feedback will be given on failure.
        - ``report_success``: If true, feedback will be given on success.
        """

        import numpy as np

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
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

        if rtol is not None and abs(ref - data) < abs(ref) * rtol:
            good = True
        if atol is not None and abs(ref - data) < atol:
            good = True

        if not good:
            return bad("'%s' is inaccurate" % name)
        else:
            if report_success:
                cls.add_feedback("'%s' looks good" % name)

        return True

    @classmethod
    def call_user(cls, f, *args, **kwargs):
        """
        Feedback.call_user(f)

        Attempts to call a student defined function, with any arbitrary arguments specified in ``*args`` and ``**kwargs``.  If the student code raises an exception, this will be caught and user feedback will be given.

        If the function call succeeds, the user return value will be returned from this function.
        """

        try:
            return f(*args, **kwargs)
        except Exception:
            if callable(f):
                try:
                    callable_name = f.__name__
                except Exception as e_name:
                    callable_name = "<unable to retrieve name; encountered %s: %s>" % (
                        type(e_name).__name__,
                        str(e_name),
                    )
                from traceback import format_exc

                cls.add_feedback(
                    "The callable '%s' supplied in your code failed with "
                    "an exception while it was being called by the "
                    "grading code:"
                    "%s" % (callable_name, "".join(format_exc()))
                )
            else:
                cls.add_feedback(
                    "Your code was supposed to supply a function or "
                    "callable, but the variable you supplied was not "
                    "callable."
                )

            raise GradingComplete()

    @classmethod
    def check_plot(
        cls,
        name,
        ref,
        plot,
        check_axes_scale=None,
        accuracy_critical=False,
        report_failure=True,
        report_success=True,
    ):
        """
        Feedback.check_plot(name, ref, plot, check_axes_scale)

        Checks that a student plot has the same lines as a reference plot solution. Can optionally check the axis scales to ensure they are the same as the reference.

        - ``name``: Name of plot scalar that is being checked.  This will be used to give feedback.
        - ``ref``: Reference plot.
        - ``data``: Student plot to be checked.  Do not mix this up with the previous value! This argument is subject to more strict type checking.
        - ``check_axes_scale``: One of None, 'x', 'y', or 'xy'.  Signals which axis scale should be checked against the reference solution.
        - ``accuracy_critical``: If true, grading will halt on failure.
        - ``report_failure``: If true, feedback will be given on failure.
        - ``report_success``: If true, feedback will be given on success.
        """

        import matplotlib.axes
        import numpy as np

        def bad(msg):
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if plot is None:
            return bad("'%s' is None or not defined" % name)

        if not isinstance(plot, matplotlib.axes.Axes):
            return bad("'%s' is not an object of matplotlib axes" % name)

        # check_axes_scale can be None, 'x', 'y', or 'xy'
        if check_axes_scale:
            scales_match = True

            if "x" in check_axes_scale:
                xscale = plot.get_xscale()
                ref_xscale = ref.get_xscale()
                if xscale != ref_xscale:
                    scales_match = False

            if "y" in check_axes_scale:
                yscale = plot.get_yscale()
                ref_yscale = ref.get_yscale()
                if yscale != ref_yscale:
                    scales_match = False

            if not scales_match:
                return bad("'%s' does not have the correct scale for its axes" % name)

        user_lines = plot.get_lines()
        ref_lines = ref.get_lines()

        if user_lines is None:
            return bad("No lines were plotted in '%s'" % name)

        if len(user_lines) != len(ref_lines):
            return bad(
                "%d lines were plotted in '%s' but %d lines were "
                "expected" % (len(user_lines), name, len(ref_lines))
            )

        ref_datas = {}
        for i, ref_line in enumerate(ref_lines):
            ref_data = np.array([ref_line.get_data()[0], ref_line.get_data()[1]])
            ref_data = ref_data[np.lexsort(ref_data.T)]
            ref_datas[i] = ref_data

        num_correct = 0
        for i, line in enumerate(user_lines):
            data = np.array([line.get_data()[0], line.get_data()[1]])
            data = data[np.lexsort(data.T)]
            for j, ref in ref_datas.items():
                if data.shape == ref.shape and np.allclose(data, ref):
                    num_correct += 1
                    del [ref_datas[j]]
                    break

        if num_correct == len(ref_lines):
            if report_success:
                cls.add_feedback("'%s' looks good" % name)
            return True
        else:
            return bad("'%s' is inaccurate" % name)

    @classmethod
    def check_dataframe(
        cls,
        name,
        ref,
        data,
        subset_columns=[],
        check_values=True,
        allow_order_variance=True,
        display_input=False,
    ):
        """
        ``check_dataframe``
        Checks and adds feedback regarding the correctness of
        a pandas ``DataFrame``.
        Author: Wade Fagen-Ulmschneider (waf)

        By default, checks if the student DataFrame ``data`` contains the same contents as the reference DataFrame ``ref`` by using ``pandas.testing.assert_frame_equal`` after basic sanity checks.

        Parameters:

        - ``name``, String: The human-readable name of the DataFrame being checked
        - ``ref``, DataFrame: The reference (correct) DataFrame
        - ``data``, DataFrame: The student DataFrame
        - ``subset_columns`` = [], Array of Strings:
          If ``subset_columns`` is an empty array, all columns are used in the check.
          Otherwise, only columns named in ``subset_columns`` are used in the check and other columns are dropped.
        - ``check_values`` = True, Boolean: Check the values of each cell, in addition to the dimensions of the DataFrame
        - ``allow_order_variance`` = True, Boolean: Allow rows to appear in any order (so long as the dimensions and values are correct)
        - ``display_input`` = False, Boolean: Display the student's answer in the feedback area.
        """

        import pandas as pd

        def bad(msg):
            cls.add_feedback(msg)
            if display_input and isinstance(data, pd.DataFrame):
                cls.add_feedback("----------")
                cls.add_feedback(data.to_string(max_rows=9))

            return False

        if not isinstance(data, pd.DataFrame):
            return bad(f"{name} is not a DataFrame")

        if len(data) == 0 and len(ref) != 0:
            return bad(f"{name} is empty and should not be empty")

        if len(ref) != len(data):
            return bad(f"{name} is inaccurate")

        # If `subset_columns` is non-empty, use only the columns
        # specified for grading
        if len(subset_columns) > 0:
            for col in subset_columns:
                if col not in data:
                    return bad(f"Variable (column) `{col}` is not in `{name}`")

            ref = ref[subset_columns]
            data = data[subset_columns]

        if check_values:
            from pandas.testing import assert_frame_equal

            try:
                assert_frame_equal(ref, data, check_like=allow_order_variance)
            except Exception:
                return bad(f"{name} is inaccurate")

        cls.add_feedback(f"{name} looks good")
        if display_input:
            cls.add_feedback("----------")
            cls.add_feedback(data.to_string(max_rows=9))
        return True

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


from collections.abc import Callable
from typing import Any, Literal, NoReturn, TypeVar

import numpy as np
from matplotlib.axes import Axes
from numpy.typing import ArrayLike, NDArray
from pandas import DataFrame


class GradingComplete(Exception):  # noqa: N818
    """
    A general exception to mark that grading has completed early.
    All future test cases are skipped.
    """


class TestComplete(Exception):  # noqa: N818
    """
    A general exception to mark that the current test case has finished early.
    Future test cases will still be executed.
    """


T = TypeVar("T")


class Feedback:
    """
    Class to provide user feedback and correctness checking of various datatypes, including NumPy arrays, Matplotlib plots, and Pandas DataFrames.
    """

    test_name = None
    feedback_file = None
    prefix_message = "\nFeedback for case %d\n---------------------\n"
    buffer = ""

    @classmethod
    def set_name(cls, name: str) -> None:
        cls.test_name = name
        cls.feedback_file = "feedback_" + name
        cls.buffer = ""

    @classmethod
    def set_main_output(cls) -> None:
        cls.test_name = "output"
        cls.feedback_file = "output"
        cls.buffer = ""

    @classmethod
    def set_test(cls, test: Any) -> None:
        # TODO: test cannot be typed as it would lead to a circular import
        # TODO: In Python 3.11 cls can be typed with typing.Self
        cls.test = test

    @classmethod
    def set_score(cls, score: float) -> None:
        """
        Set the score for the test case, should be a floating point value between 0 and 1.

        Examples:
            >>> Feedback.set_score(0.75)
        """
        if score < 0:
            score = 0.0
        elif score > 1:
            score = 1.0

        cls.test.points = score

    @classmethod
    def add_iteration_prefix(cls, iter_prefix: int) -> None:
        cls.buffer = cls.prefix_message % iter_prefix

    @classmethod
    def clear_iteration_prefix(cls) -> None:
        cls.buffer = ""

    @classmethod
    def add_feedback(cls, text: str) -> None:
        """
        Adds some text to the feedback output for the current test.

        Examples:
            >>> Feedback.add_feedback("The return value is not correct.")
        """
        if cls.feedback_file is None:
            raise RuntimeError("Cannot add feedback without a feedback file set. ")

        with open(
            "/grade/run/" + cls.feedback_file + ".txt", "a+", encoding="utf-8"
        ) as f:
            f.write(cls.buffer + text)
            f.write("\n")
            cls.buffer = ""

    @classmethod
    def finish(cls, fb_text: str) -> NoReturn:
        """
        Complete grading immediately, additionally outputting the message in fb_text.

        Examples:
            >>> Feedback.finish("Invalid format")
        """
        cls.add_feedback(fb_text)
        raise GradingComplete

    @classmethod
    def finish_test(cls, fb_text: str) -> NoReturn:
        """
        Complete grading the current test case immediately, additionally
        outputting the message in fb_text.

        Unlike Feedback.finish(), this method only halts the current test case
        while allowing subsequent test cases to continue executing.

        Parameters:
            fb_text: Message to output before halting the test case.

        Examples:
            >>> Feedback.finish_test("Invalid format")
        """
        cls.add_feedback(fb_text)
        raise TestComplete

    @staticmethod
    def not_allowed(*_args: Any, **_kwargs: Any) -> NoReturn:
        """
        Used to hook into disallowed functions, raises an exception if
        the student tries to call it.

        Note that because Python is a highly-dynamic language, this method can
        be bypassed by students with sufficient knowledge of Python. For stronger
        guarantees about which functions are or are not used, consider using more
        advanced static analysis techniques, which are beyond the scope of what
        this autograder offers. You can also perform verification by hand with
        manual grading.
        """
        raise RuntimeError("The use of this function is not allowed.")

    @classmethod
    def check_numpy_array_sanity(
        cls, name: str, num_axes: int, data: ArrayLike | None
    ) -> None:
        """
        Perform a sanity check on a NumPy array, making sure that it is in fact defined and has the correct dimensionality. If the checks fail then grading will automatically stop.

        Parameters:
            name: Name of the array that is being checked. This will be used to give feedback.
            num_axes: Number of axes that the array should have.
            data: NumPy array to check.

        Examples:
            >>> Feedback.check_numpy_array_sanity(name, num_axes, data)
        """

        import numpy as np

        if data is None:
            cls.finish(f"'{name}' is None or not defined")

        if not isinstance(data, np.ndarray):
            cls.finish(f"'{name}' is not a numpy array")

        if isinstance(data, np.matrix):
            cls.finish(
                f"'{name}' is a numpy matrix. Do not use those. "
                "https://docs.scipy.org/doc/scipy/tutorial/linalg.html#numpy-matrix-vs-2-d-numpy-ndarray"
            )

        if len(data.shape) != num_axes:
            cls.finish(
                f"'{name}' does not have the correct number of axes--"
                f"got: {len(data.shape)}, expected: {num_axes}"
            )

        if data.dtype.kind not in "fc":
            cls.finish(
                f"'{name}' does not consist of floating point numbers--"
                f"got: '{data.dtype}'"
            )

    @classmethod
    def check_numpy_array_features(
        cls,
        name: str,
        ref: NDArray[Any],
        data: None | ArrayLike,
        accuracy_critical: bool = False,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
        report_success: bool = True,  # noqa: FBT001
    ) -> bool | None:
        """
        Check that a student NumPy array has the same shape and datatype as a reference solution NumPy array.

        Parameters:
            name: Name of the array that is being checked. This will be used to give feedback.
            ref: Reference NumPy array.
            data: Student NumPy array to be checked. Do not mix this up with the previous array! This argument is subject to more strict type checking.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.

        Examples:
            >>> Feedback.check_numpy_array_features("b", self.ref.a, self.st.b, accuracy_critical=True)
        """
        import numpy as np

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad(f"'{name}' is None or not defined")

        if not isinstance(data, np.ndarray):
            return bad(f"'{name}' is not a numpy array")

        if isinstance(data, np.matrix):
            return bad(
                f"'{name}' is a numpy matrix. Do not use those. "
                "https://docs.scipy.org/doc/scipy/tutorial/linalg.html#numpy-matrix-vs-2-d-numpy-ndarray"
            )

        if ref.shape != data.shape:
            return bad(
                f"'{name}' does not have correct shape--"
                f"got: '{data.shape}', expected: '{ref.shape}'"
            )

        if ref.dtype.kind != data.dtype.kind:
            return bad(
                f"'{name}' does not have correct data type--"
                f"got: '{data.dtype}', expected: '{ref.dtype}'"
            )

        if report_success:
            cls.add_feedback(f"'{name}' looks good")

        return True

    @classmethod
    def check_numpy_array_allclose(
        cls,
        name: str,
        ref: NDArray[Any],
        data: ArrayLike,
        accuracy_critical: bool = False,  # noqa: FBT001
        rtol: float = 1e-05,
        atol: float = 1e-08,
        report_success: bool = True,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Check that a student NumPy array has similar values to a reference NumPy array. Note that this checks value according to the numpy.allclose function, which goes by the following check:
        `absolute(a - b) <= (atol + rtol * absolute(b))`

        Parameters:
            name: Name of the array that is being checked. This will be used to give feedback.
            ref: Reference NumPy array.
            data: Student NumPy array to be checked. Do not mix this up with the previous array! This argument is subject to more strict type checking.
            rtol: Maximum relative tolerance between values.
            atol: Maximum absolute tolerance between values.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.

        Examples:
            >>> Feedback.check_numpy_array_allclose("G", self.ref.G, self.st.G)
        """

        import numpy as np

        if not cls.check_numpy_array_features(
            name, ref, data, accuracy_critical, report_failure, report_success=False
        ):
            return False

        good = np.allclose(ref, data, rtol=rtol, atol=atol)

        if not good:
            if report_failure:
                cls.add_feedback(f"'{name}' is inaccurate")
        elif report_success:
            cls.add_feedback(f"'{name}' looks good")

        if accuracy_critical and not good:
            raise GradingComplete("Inaccurate, grading halted")

        return good

    @classmethod
    def check_list(
        cls,
        name: str,
        ref: list[Any],
        data: list[Any] | None,
        entry_type: Any | None = None,
        accuracy_critical: bool = False,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
        report_success: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Check that a student list has correct length with respect to a reference list. Can also check for a homogeneous data type for the list.

        Parameters:
            name: Name of the list that is being checked. This will be used to give feedback.
            ref: Reference list.
            data: Student list to be checked. Do not mix this up with the previous list! This argument is subject to more strict type checking.
            entry_type: If not None, requires that each element in the student solution be of this type.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.

        Examples:
            >>> Feedback.check_list(name, ref, data)
        """

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad(f"'{name}' is None or not defined")

        if not isinstance(data, list):
            return bad(f"'{name}' is not a list")

        if len(ref) != len(data):
            return bad(
                f"'{name}' has the wrong length--expected {len(ref)}, got {len(data)}"
            )

        if entry_type is not None:
            for i, entry in enumerate(data):
                if not isinstance(entry, entry_type):
                    return bad(f"'{name}[{i}]' has the wrong type")

        if report_success:
            cls.add_feedback(f"'{name}' looks good")

        return True

    @classmethod
    def check_dict(
        cls,
        name: str,
        ref: dict[Any, Any],
        data: dict[Any, Any],
        *,
        target_keys: None | list[str] | set[str] = None,
        accuracy_critical: bool = False,
        report_failure: bool = True,
        report_success: bool = True,
    ) -> bool:
        """
        Checks that a student dict (`data`) has all correct key-value mappings with respect to a reference dict (`ref`).

        Parameters:
            name: Name of the dict that is being checked. This will be used to give feedback.
            ref: Reference dict.
            data: Student dict to be checked. Do not mix this up with the previous dict! This argument is subject to more strict type checking.
            target_keys: If not None, it will only only compare the keys listed.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.
        """

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)
            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if not isinstance(data, dict):
            return bad(f"'{name}' is not a dict, got type {type(data).__name__}")

        if target_keys is not None and not all(key in ref for key in target_keys):
            # If target_keys is not None, we should only check the keys in target_keys
            # and not the keys in ref
            raise ValueError(
                f"target_keys must be a subset of the reference dict keys. "
                f"Got {target_keys=} but ref.keys={list(ref.keys())}"
            )

        check_all = target_keys is None
        keys_to_check = ref.keys() if check_all else target_keys

        missing_keys = set(keys_to_check) - set(data.keys())
        if missing_keys:
            return bad(
                f"'{name}' has missing keys: `{', '.join(sorted(map(str, missing_keys)))}`"
            )

        extra_keys = set(data.keys()) - set(keys_to_check)
        if check_all and extra_keys:
            return bad(
                f"'{name}' has extra keys: `{', '.join(sorted(map(str, extra_keys)))}`"
            )

        # Now check the values themselves
        for key in keys_to_check:
            # It's possible that the equality will pass even if the types are different
            if type(ref[key]) is not type(data[key]):
                return bad(
                    f"'{name}' has key `{key}` with type `{type(data[key]).__name__}`, which is not the right type"
                )

            if ref[key] != data[key]:
                return bad(
                    f"'{name}' has key `{key}` with value `{data[key]}`, which is not correct"
                )

        if report_success:
            cls.add_feedback(f"'{name}' looks good")

        return True

    @classmethod
    def check_tuple(
        cls,
        name: str,
        ref: tuple[Any],
        data: tuple[Any] | None,
        accuracy_critical: bool = False,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
        report_success: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Check that a student tuple has correct length with respect to a reference tuple, and same values.

        Parameters:
            name: Name of the tuple that is being checked. This will be used to give feedback.
            ref: Reference tuple.
            data: Student tuple to be checked. Do not mix this up with the previous tuple! This argument is subject to more strict type checking.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.

        Examples:
            >>> Feedback.check_tuple(name, ref, data)
        """

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad(f"{name} is None or not defined")

        if not isinstance(data, tuple):
            return bad(f"{name} is not a tuple")

        nref = len(ref)
        if len(data) != nref:
            return bad(f"{name} should be of length {nref}")

        good = True
        for i in range(nref):
            if type(data[i]) != type(ref[i]):  # noqa: E721
                good = False
                if report_failure:
                    cls.add_feedback(
                        f"{name}[{i}] should be of type {type(ref[i]).__name__}"
                    )
            elif data[i] != ref[i]:
                good = False

        if not good:
            return bad(f"'{name}' is inaccurate")
        elif report_success:
            cls.add_feedback(f"'{name}' looks good")

        return True

    @classmethod
    def check_scalar(
        cls,
        name: str,
        ref: complex | np.number[Any],
        data: complex | np.number[Any] | None,
        accuracy_critical: bool = False,  # noqa: FBT001
        rtol: float = 1e-5,
        atol: float = 1e-8,
        report_success: bool = True,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Check that a student scalar has correct value with respect to a reference scalar. This will mark a value as correct if it passes any of the following checks:

        - `abs(ref - data) < ref(ref) * rtol`
        - `abs(ref - data) < atol`

        One of rtol or atol can be omitted (set to None) if that check is unwanted.
        Or both, but then nothing would be graded :)

        Parameters:
            name: Name of the scalar that is being checked. This will be used to give feedback.
            ref: Reference scalar.
            data: Student scalar to be checked. Do not mix this up with the previous value! This argument is subject to more strict type checking.
            accuracy_critical: If true, grading will halt on failure.
            rtol: Maximum relative tolerance.
            atol: Maximum absolute tolerance.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.

        Examples:
            >>> Feedback.check_scalar("y", self.ref.y, self.st.y)
        """

        import numpy as np

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if data is None:
            return bad(f"'{name}' is None or not defined")

        if not isinstance(data, (complex, float, int, np.number)):
            try:
                # Check whether data is a sympy number because sympy
                # numbers do not follow the typical interface
                # See https://github.com/inducer/relate/pull/284
                if not data.is_number:
                    return bad(f"'{name}' is not a number")
            except AttributeError:
                return bad(f"'{name}' is not a number")

        good = False

        if rtol is not None and abs(ref - data) < abs(ref) * rtol:
            good = True
        if atol is not None and abs(ref - data) < atol:
            good = True

        if not good:
            return bad(f"'{name}' is inaccurate")
        elif report_success:
            cls.add_feedback(f"'{name}' looks good")

        return True

    @classmethod
    def call_user(
        cls,
        f: Callable[..., T],
        *args: Any,
        stop_on_exception: bool = True,
        **kwargs: Any,
    ) -> Any:
        """
        Attempts to call a student defined function, with any arbitrary arguments.
        If the student code raises an exception, this will be caught and user feedback will be given.
        If the function call succeeds, the user return value will be returned from this function.

        Note that the keyword argument stop_on_exception will *not* be passed to the
        student defined function f, but all other keyword arguments will.

        Parameters:
            f: Student defined function to be called.
            *args: Arbitrary positional arguments to be passed to the student function.
            stop_on_exception: If true, grading will halt on failure.
            **kwargs: Arbitrary keyword arguments to be passed to the student function.

        Examples:
            >>> user_val = Feedback.call_user(self.st.fib, 5)
        """

        try:
            return f(*args, **kwargs)
        except Exception as exc:
            if callable(f):
                try:
                    callable_name = f.__name__
                except Exception as e_name:
                    callable_name = f"<unable to retrieve name; encountered {type(e_name).__name__}: {e_name}>"
                from traceback import format_exc

                cls.add_feedback(
                    "The callable '{}' supplied in your code failed with "
                    "an exception while it was being called by the "
                    "grading code:"
                    "{}".format(callable_name, "".join(format_exc()))
                )
            else:
                cls.add_feedback(
                    "Your code was supposed to supply a function or "
                    "callable, but the variable you supplied was not "
                    "callable."
                )

            cls.set_score(0.0)

            if stop_on_exception:
                raise GradingComplete from exc
            raise TestComplete from exc

    @classmethod
    def check_plot(
        cls,
        name: str,
        ref: Axes,
        plot: Axes,
        check_axes_scale: Literal[None, "x", "y", "xy"] = None,
        accuracy_critical: bool = False,  # noqa: FBT001
        report_failure: bool = True,  # noqa: FBT001
        report_success: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Checks that a student plot has the same lines as a reference plot solution. Can optionally check the axis scales to ensure they are the same as the reference.

        Parameters:
            name: Name of plot scalar that is being checked. This will be used to give feedback.
            ref: Reference plot.
            plot: Student plot to be checked. Do not mix this up with the previous value! This argument is subject to more strict type checking.
            check_axes_scale: Signals which axis scale should be checked against the reference solution.
            accuracy_critical: If true, grading will halt on failure.
            report_failure: If true, feedback will be given on failure.
            report_success: If true, feedback will be given on success.

        Examples:
            >>> Feedback.check_plot("plot", self.ref.plot, self.st.plot, check_axes_scale="xy")
        """

        import matplotlib.axes
        import numpy as np

        def bad(msg: str) -> Literal[False]:
            if report_failure:
                cls.add_feedback(msg)

            if accuracy_critical:
                cls.finish("")
            else:
                return False

        if plot is None:
            return bad(f"'{name}' is None or not defined")

        if not isinstance(plot, matplotlib.axes.Axes):
            return bad(f"'{name}' is not an object of matplotlib axes")

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
                return bad(f"'{name}' does not have the correct scale for its axes")

        user_lines = plot.get_lines()
        ref_lines = ref.get_lines()

        if user_lines is None:
            return bad(f"No lines were plotted in '{name}'")

        if len(user_lines) != len(ref_lines):
            return bad(
                f"{len(user_lines)} lines were plotted in '{name}' but {ref_lines} lines were expected"
            )

        ref_datas = {}
        for i, ref_line in enumerate(ref_lines):
            ref_data = np.array([ref_line.get_data()[0], ref_line.get_data()[1]])
            ref_data = ref_data[np.lexsort(ref_data.T)]
            ref_datas[i] = ref_data

        num_correct = 0
        for line in user_lines:
            data = np.array([line.get_data()[0], line.get_data()[1]])
            data = data[np.lexsort(data.T)]
            for j, ref_data in ref_datas.items():
                if data.shape == ref_data.shape and np.allclose(data, ref_data):
                    num_correct += 1
                    del ref_datas[j]
                    break

        if num_correct == len(ref_lines):
            if report_success:
                cls.add_feedback(f"'{name}' looks good")
            return True
        else:
            return bad(f"'{name}' is inaccurate")

    @classmethod
    def check_dataframe(
        cls,
        name: str,
        ref: DataFrame,
        data: DataFrame,
        subset_columns: list[str] | None = None,
        check_values: bool = True,  # noqa: FBT001
        allow_order_variance: bool = True,  # noqa: FBT001
        display_input: bool = False,  # noqa: FBT001
        report_success: bool = True,  # noqa: FBT001
    ) -> bool:
        """
        Checks and adds feedback regarding the correctness of a pandas! `DataFrame`.

        **Author**: Wade Fagen-Ulmschneider (waf)

        By default, checks if the student DataFrame `data` contains the same contents as the reference DataFrame `ref` by using `pandas.testing.assert_frame_equal` after basic sanity checks.

        Parameters:
            name: The human-readable name of the DataFrame being checked
            ref: The reference (correct) DataFrame
            data: The student DataFrame
            subset_columns: If `subset_columns` is an empty array, all columns are used in the check. Otherwise, only columns named in `subset_columns` are used in the check and other columns are dropped.
            check_values: Check the values of each cell, in addition to the dimensions of the DataFrame
            allow_order_variance: Allow rows to appear in any order (so long as the dimensions and values are correct)
            display_input: Display the student's answer in the feedback area.
            report_success: Report success if the DataFrame is correct
        """

        import pandas as pd

        def bad(msg: str) -> Literal[False]:
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

        if subset_columns is None:
            subset_columns = []
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

        if report_success:
            cls.add_feedback(f"'{name}' looks good")

        if display_input:
            cls.add_feedback("----------")
            cls.add_feedback(data.to_string(max_rows=9))
        return True

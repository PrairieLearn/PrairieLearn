<!-- Python-Autograder documentation master file, created by
sphinx-quickstart on Mon May 18 10:29:36 2020.
You can adapt this file completely to your liking, but it should at least
contain the root `toctree` directive. -->

# Python Autograder documentation

### class code_feedback.Feedback()

Class to provide user feedback and correctness checking of various datatypes, including NumPy arrays, Matplotlib plots, and Pandas DataFrames.

#### classmethod add_feedback(text)

Adds some text to the feedback output for the current test.

#### classmethod call_user(f)

Attempts to call a student defined function, with any arbitrary arguments specified in `*args` and `**kwargs`. If the student code raises an exception, this will be caught and user feedback will be given.

If the function call succeeds, the user return value will be returned from this function.

#### classmethod check_dataframe(name, ref, data, subset_columns=[], check_values=True, allow_order_variance=True, display_input=False)

`check_dataframe`
Checks and adds feedback regarding the correctness of
a pandas `DataFrame`.
Author: Wade Fagen-Ulmschneider (waf)

By default, checks if the student DataFrame `data` contains the same contents as the reference DataFrame `ref` by using `pandas.testing.assert_frame_equal` after basic sanity checks.

Parameters:

- `name`, String: The human-readable name of the DataFrame being checked

- `ref`, DataFrame: The reference (correct) DataFrame

- `data`, DataFrame: The student DataFrame

- `subset_columns` = [], Array of Strings:
  If `subset_columns` is an empty array, all columns are used in the check.
  Otherwise, only columns named in `subset_columns` are used in the check and other columns are dropped.

- `check_values` = True, Boolean: Check the values of each cell, in addition to the dimensions of the DataFrame

- `allow_order_variance` = True, Boolean: Allow rows to appear in any order (so long as the dimensions and values are correct)

- `display_input` = False, Boolean: Display the student’s answer in the feedback area.

#### classmethod check_list(name, ref, data)

Check that a student list has correct length with respect to a reference list. Can also check for a homogeneous data type for the list.

- `name`: Name of the list that is being checked. This will be used to give feedback.

- `ref`: Reference list.

- `data`: Student list to be checked. Do not mix this up with the previous list! This argument is subject to more strict type checking.

- `entry_type`: If not None, requires that each element in the student solution be of this type.

- `accuracy_critical`: If true, grading will halt on failure.

- `report_failure`: If true, feedback will be given on failure.

#### classmethod check_numpy_array_allclose(name, ref, data, accuracy_critical=False, rtol=1e-05, atol=1e-08, report_success=True, report_failure=True)

Feedback.check_numpy_allclose(name, ref, data)

Check that a student NumPy array has similar values to a reference NumPy array. Note that this checks value according to the numpy.allclose function, which goes by the following check:
`absolute(a - b) <= (atol + rtol * absolute(b))`

- `name`: Name of the array that is being checked. This will be used to give feedback.

- `ref`: Reference NumPy array.

- `data`: Student NumPy array to be checked. Do not mix this up with the previous array! This argument is subject to more strict type checking.

- `rtol`: Maximum relative tolerance between values.

- `atol`: Maximum absolute tolerance between values.

- `accuracy_critical`: If true, grading will halt on failure.

- `report_failure`: If true, feedback will be given on failure.

#### classmethod check_numpy_array_features(name, ref, data)

Check that a student NumPy array has the same shape and datatype as a reference solution NumPy array.

- `name`: Name of the array that is being checked. This will be used to give feedback.

- `ref`: Reference NumPy array.

- `data`: Student NumPy array to be checked. Do not mix this up with the previous array! This argument is subject to more strict type checking.

- `accuracy_critical`: If true, grading will halt on failure.

- `report_failure`: If true, feedback will be given on failure.

#### classmethod check_numpy_array_sanity(name, num_axes, data)

Perform a sanity check on a NumPy array, making sure that it is in fact defined and has the correct dimensionality. If the checks fail then grading will automatically stop.

- `name`: Name of the array that is being checked. This will be used to give feedback.

- `num_axes`: Number of axes that the array should have.

- `data`: NumPy array to check.

#### classmethod check_plot(name, ref, plot, check_axes_scale)

Checks that a student plot has the same lines as a reference plot solution. Can optionally check the axis scales to ensure they are the same as the reference.

- `name`: Name of plot scalar that is being checked. This will be used to give feedback.

- `ref`: Reference plot.

- `data`: Student plot to be checked. Do not mix this up with the previous value! This argument is subject to more strict type checking.

- `check_axes_scale`: One of None, ‘x’, ‘y’, or ‘xy’. Signals which axis scale should be checked against the reference solution.

- `accuracy_critical`: If true, grading will halt on failure.

- `report_failure`: If true, feedback will be given on failure.

- `report_success`: If true, feedback will be given on success.

#### classmethod check_scalar(name, ref, data)

Check that a student scalar has correct value with respect to a reference scalar. This will mark a value as correct if it passes any of the following checks:

- `abs(ref - data) < ref(ref) * rtol`

- `abs(ref - data) < atol`

One of rtol or atol can be omitted (set to None) if that check is unwanted.
Or both, but then nothing would be graded :)

- `name`: Name of the scalar that is being checked. This will be used to give feedback.

- `ref`: Reference scalar.

- `data`: Student scalar to be checked. Do not mix this up with the previous value! This argument is subject to more strict type checking.

- `accuracy_critical`: If true, grading will halt on failure.

- `rtol`: Maximum relative tolerance.

- `atol`: Maximum absolute tolerance.

- `report_failure`: If true, feedback will be given on failure.

- `report_success`: If true, feedback will be given on success.

#### classmethod check_tuple(name, ref, data)

Check that a student tuple has correct length with respect to a reference tuple, and same values.

- `name`: Name of the tuple that is being checked. This will be used to give feedback.

- `ref`: Reference tuple.

- `data`: Student tuple to be checked. Do not mix this up with the previous tuple! This argument is subject to more strict type checking.

- `accuracy_critical`: If true, grading will halt on failure.

- `report_failure`: If true, feedback will be given on failure.

- `report_success`: If true, feedback will be given on success.

#### classmethod finish(fb_text)

Complete grading immediately, additionally outputting the message in fb_text.

#### static not_allowed()

library_function = Feedback.not_allowed

Used to hook into disallowed functions, raises an exception if
the student tries to call it.

#### classmethod set_score(percentage)

Set the score for the test case, should be a floating point value between 0 and 1.

---

### class pl_unit_test.PLTestCase(methodName='runTest')

Base class for test suites, using the Python unittest library.
Handles automatic setup and teardown of testing logic.

Methods here do not need to be overridden by test suites.

#### classmethod get_total_points()

Get the total number of points awarded by this test suite, including
cases where the test suite is run multiple times.

#### classmethod setUpClass()

On start, run the user code and generate answer tuples.

#### classmethod tearDownClass()

Close all plots and increment the iteration number on test finish

---

### class pl_unit_test.PLTestCaseWithPlot(methodName='runTest')

Test suite that includes plot grading. Will automatically check plots
for appropriate labels.

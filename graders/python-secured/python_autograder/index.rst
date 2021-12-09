.. Python-Autograder documentation master file, created by
   sphinx-quickstart on Mon May 18 10:29:36 2020.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

Python Autograder documentation
=============================================

.. toctree::
   :maxdepth: 2
   :caption: Contents:

.. autoclass:: code_feedback.Feedback
   :members: set_score, add_feedback, finish, not_allowed, check_numpy_array_sanity, check_numpy_array_features, check_numpy_array_allclose, check_list, check_tuple, check_scalar, call_user, check_plot, check_dataframe

=============================================

.. autoclass:: pl_unit_test.PLTestCase
   :members: setUpClass, tearDownClass, display_plot, get_total_points

=============================================

.. autoclass:: pl_unit_test.PLTestCaseWithPlot

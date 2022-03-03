from pl_helpers import name, points, not_repeated
from pl_unit_test import PLTestCaseWithPlot, PLTestCase
from code_feedback import Feedback
from functools import wraps

{{#params}}
class Test(PLTestCaseWithPlot):
    # We generate one test for each input/output pair specified in server.py.
{{#pairs}}
    @points(1)
    @name("test_input_{{input}}")
    def test_{{input}}(self):
        if Feedback.call_user(self.st.{{function_name}}, "{{input}}") == "{{output}}":
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)
{{/pairs}}

    # And also check the default value.
    @points(1)
    @name("test_default_output")
    def test_default_output(self):
        if Feedback.call_user(self.st.{{function_name}}, "{{invalid_input}}") == "{{default_output}}":
            Feedback.set_score(1)
        else:
            Feedback.set_score(0)
{{/params}}
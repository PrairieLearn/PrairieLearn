from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(4)
    @name("Test expected inputs")
    def test_input(self):
        function_name = self.data["params"]["function_name"]
        student_function = getattr(self.st, function_name)

        num_correct = 0
        pairs_dicts = self.data["params"]["pairs"]

        for pair_dict in pairs_dicts:
            input = pair_dict["input"]
            expected_output = pair_dict["output"]
            student_output = Feedback.call_user(student_function, input)

            if student_output == expected_output:
                Feedback.add_feedback(
                    f'Function "{function_name}" returned "{student_output}" on input "{input}".'
                )
                num_correct += 1

            else:
                Feedback.add_feedback(
                    f'Function "{function_name}" returned "{student_output}" on input "{input}", not "{expected_output}".'
                )

        percentage_score = num_correct / len(pairs_dicts)
        Feedback.set_score(percentage_score)

    @points(1)
    @name("Test default output")
    def test_default_output(self):
        function_name = self.data["params"]["function_name"]
        student_function = getattr(self.st, function_name)
        invalid_input = self.data["params"]["invalid_input"]
        default_output = self.data["params"]["default_output"]

        student_output = Feedback.call_user(student_function, invalid_input)

        if student_output == default_output:
            Feedback.add_feedback(
                f'Function "{function_name}" returned "{student_output}" on input "{invalid_input}".'
            )
            Feedback.set_score(1)

        else:
            Feedback.add_feedback(
                f'Function "{function_name}" returned "{student_output}" on input "{invalid_input}", not "{default_output}".'
            )
            Feedback.set_score(0)

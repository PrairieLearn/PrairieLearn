from code_feedback import Feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(10)
    @name("Checking list elements")
    def test_0(self):
        points = 0
        st_nums = Feedback.call_user(self.st.list_sort, self.ref.nums)
        Feedback.check_list("nums", self.ref.sorted_nums, self.ref.nums, entry_type=int)

        # Check original list
        correct_list = True
        for i, f in enumerate(self.ref.sorted_nums):
            if self.ref.nums[i] != f:
                correct_list = False

        # Check return student list
        correct_st_list = type(st_nums) == list and len(st_nums) == len(
            self.ref.sorted_nums
        )
        if not correct_list and correct_st_list:
            for i, f in enumerate(self.ref.sorted_nums):
                if st_nums[i] != f:
                    correct_st_list = False

        if correct_list:
            Feedback.add_feedback("Your function correctly sorted the list.")
            points = 1
        else:
            if correct_st_list:
                points += 0.35
                Feedback.add_feedback("List was sorted, but not in-place")
            else:
                Feedback.add_feedback(
                    "The elements of the original list were not correctly sorted"
                )

        Feedback.set_score(points)

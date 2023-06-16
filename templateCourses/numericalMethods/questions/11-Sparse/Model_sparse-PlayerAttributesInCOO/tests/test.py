import numpy as np
from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(10)
    @name("COO Matrix")
    def test_0(self):
        score = 0

        # Performs basic checks on the lists
        if (
            (feedback.check_list("row", self.ref.row, self.st.row, entry_type=int))
            & (feedback.check_list("col", self.ref.col, self.st.col, entry_type=int))
            & (feedback.check_list("data", self.ref.data, self.st.data, entry_type=int))
        ):

            # Zip and sort the lists
            ref_entries = sorted(zip(self.ref.row, self.ref.col, self.ref.data))
            st_entries = sorted(zip(self.st.row, self.st.col, self.st.data))
            if not np.allclose(ref_entries, st_entries):
                feedback.finish(
                    "Your row, col, and data have the correct length and data type but the resulting COO matrix is incorrect"
                )
            else:
                feedback.add_feedback("row, col, and data looks right")
                feedback.set_score(1)

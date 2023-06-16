from code_feedback import Feedback as feedback
from pl_helpers import name, points
from pl_unit_test import PLTestCase


class Test(PLTestCase):
    @points(5)
    @name("zeros")
    def test_0(self):
        # Total score

        try:
            my_zeros = list(self.st.roots)
        except:
            feedback.set_score(0)
            feedback.add_feedback("zeros is not iterable.")
            return

        if len(my_zeros) != len(self.ref.intervals):
            feedback.add_feedback("Number of zeros does not match number of intervals")
            # No need to return--zip will deal with the mismatch.

        correct = 0
        for idx, (sol, zero) in enumerate(zip(self.ref.roots, my_zeros)):
            if zero is None:
                if sol is None:
                    # those are the ones with errors.
                    correct += 1
                    continue
                else:
                    feedback.add_feedback(
                        "Your computed zero %s is incorrect." % (idx + 1)
                    )
            elif sol is None:
                feedback.add_feedback(
                    "Your code should have reported an error for interval %d."
                    % (idx + 1)
                )
                continue

            if not isinstance(zero, (int, float)):
                feedback.add_feedback(
                    "Your computed zero %s is not a number." % (idx + 1)
                )
                continue

            rel_err = abs(sol - zero) / abs(self.ref.roots[idx])

            if rel_err > 1e-7:
                feedback.add_feedback("Your computed zero %s is incorrect." % (idx + 1))
            else:
                correct += 1

        feedback.set_score(correct / len(self.ref.roots))

import random

import pytest
from pytest_prairielearn_grader.assertions import assert_equal
from pytest_prairielearn_grader.fixture import StudentFixture


@pytest.mark.grading_data(name="last_element", points=10)
def test_last_element(sandbox: StudentFixture, subtests: pytest.Subtests) -> None:
    for _ in range(10):
        lst = random.sample(range(1000), k=random.randint(1, 20))
        with subtests.test(f"last_element({lst})"):
            value, lst_after = sandbox.query_function("_last_element_and_list", lst)
            assert_equal(value, lst[-1])
            assert_equal(
                lst_after, lst, msg="Your function should not modify the input list."
            )

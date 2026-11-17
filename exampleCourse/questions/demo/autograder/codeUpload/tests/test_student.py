import pytest
from pytest_prairielearn_grader import ConfigObject
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import StudentFixture

autograder_config = ConfigObject(student_code_pattern="fib.py")


@pytest.mark.grading_data(name="Check fib(1)", points=1)
def test_fib_1(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(1,), expected=1, description="fib(1)")


@pytest.mark.grading_data(name="Check fib(7)", points=2)
def test_fib_7(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(7,), expected=13, description="fib(7)")


@pytest.mark.grading_data(name="Check random values", points=3)
def test_random_values(sandbox: StudentFixture, subtests: pytest.Subtests) -> None:
    for n in [2, 3, 5, 8, 13, 17, 19, 23, 27, 29]:
        with subtests.test():
            assert_fn_equal(
                sandbox, "fib", args=(n,), expected=_fib(n), description=f"fib({n})"
            )


def _fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

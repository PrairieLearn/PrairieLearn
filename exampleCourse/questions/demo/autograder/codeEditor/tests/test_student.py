import pytest
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="Check fib(1)", points=1)
def test_fib_1(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(1,), expected=1, description="fib(1)")


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="Check fib(7)", points=2)
def test_fib_7(sandbox: StudentFixture) -> None:
    assert_fn_equal(sandbox, "fib", args=(7,), expected=13, description="fib(7)")


@pytest.mark.output(level="friendly")
@pytest.mark.grading_data(name="Check random values", points=3)
def test_random_values(sandbox: StudentFixture, feedback: FeedbackFixture) -> None:
    test_values = [2, 3, 5, 8, 13, 17, 19, 23, 27, 29]
    for index, n in enumerate(test_values):
        assert_fn_equal(
            sandbox,
            "fib",
            args=(n,),
            expected=_fib(n),
            description=f"fib({n})",
        )
        feedback.set_score((index + 1) / len(test_values))


def _fib(n: int) -> int:
    if n <= 1:
        return n
    return _fib(n - 1) + _fib(n - 2)

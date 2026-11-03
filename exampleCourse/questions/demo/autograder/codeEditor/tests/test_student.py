import pytest
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture


@pytest.mark.grading_data(name="Check fib(1)", points=1)
def test_fib_1(sandbox: StudentFixture) -> None:
    assert sandbox.query_function("fib", 1) == 1


@pytest.mark.grading_data(name="Check fib(7)", points=2)
def test_fib_7(sandbox: StudentFixture) -> None:
    assert sandbox.query_function("fib", 7) == 13


@pytest.mark.grading_data(name="Check random values", points=3)
def test_random_values(
    sandbox: StudentFixture, feedback: FeedbackFixture
) -> None:
    test_values = [2, 3, 5, 8, 13, 17, 19, 23, 27, 29]
    num_correct = sum(
        sandbox.query_function("fib", n) == _fib(n) for n in test_values
    )
    feedback.set_score(num_correct / len(test_values))
    assert num_correct == len(test_values), "Incorrect Fibonacci value"


def _fib(n: int) -> int:
    if n <= 1:
        return n
    return _fib(n - 1) + _fib(n - 2)

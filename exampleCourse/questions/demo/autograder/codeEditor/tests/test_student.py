import pytest
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import FeedbackFixture, StudentFixture
from pytest_prairielearn_grader.utils import FunctionStatusCode


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
    num_correct = 0
    failures = []

    for n in test_values:
        response = sandbox.query_function_raw("fib", n)
        if response["status"] == FunctionStatusCode.TIMEOUT:
            failures.append(f"fib({n}): timed out")
            break
        expected = _fib(n)
        if (
            response["status"] == FunctionStatusCode.SUCCESS
            and response["value"] == expected
        ):
            num_correct += 1
        else:
            failures.append(_format_failure(f"fib({n})", expected, response))

    if failures:
        feedback.add_message("\n\n".join(failures))
    feedback.set_score_final(num_correct / len(test_values))


def _fib(n: int) -> int:
    if n <= 1:
        return n
    return _fib(n - 1) + _fib(n - 2)


def _format_failure(description: str, expected: int, response: dict) -> str:
    if response["status"] == FunctionStatusCode.SUCCESS:
        return f"{description}: expected {expected}, got {response['value']}"
    return (
        f"{description}: raised {response['exception_name']}: "
        f"{response['exception_message']}"
    )

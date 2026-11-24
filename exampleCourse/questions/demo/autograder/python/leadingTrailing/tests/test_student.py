import numbers

import numpy as np
import pytest
from pytest_prairielearn_grader.assertions import assert_approx_equal, assert_true
from pytest_prairielearn_grader.fixture import StudentFixture


@pytest.mark.grading_data(name="gradient_descent()", points=1)
def test_0(sandbox: StudentFixture, subtests: pytest.Subtests) -> None:
    tests = 50
    xs = np.linspace(-1, 1, tests)
    alphas = np.linspace(0.1, 0.001, tests)
    np.random.shuffle(xs)
    np.random.shuffle(alphas)

    for x, alpha in zip(xs.tolist(), alphas.tolist(), strict=True):
        with subtests.test(f"gradient_descent({x}, {alpha})"):
            value = sandbox.query_function("gradient_descent", x, alpha)
            assert_true(
                isinstance(value, numbers.Number), msg="'x_new' is not a number"
            )
            assert_approx_equal(value, x - alpha * (2 * x), msg="'x_new' is inaccurate")

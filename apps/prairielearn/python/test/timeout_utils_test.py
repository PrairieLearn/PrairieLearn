import time

import pytest
from prairielearn.timeout_utils import (
    ThreadingTimeout,
    TimeoutExceptionError,
    TimeoutState,
)
from sympy import Eq, exp, simplify, sin, symbols


def busy_loop(timeout: float, busy_duration: float, *, swallow_exc: bool = True):
    with ThreadingTimeout(timeout, swallow_exc=swallow_exc) as ctx:
        time.sleep(busy_duration)
    return ctx


def test_short_execution():
    ctx = busy_loop(4.0, 0.1)
    assert ctx.state == TimeoutState.EXECUTED


def test_long_execution():
    ctx = busy_loop(0.1, 10.0)
    assert ctx.state == TimeoutState.TIMED_OUT


def test_timeout_exc():
    with pytest.raises(TimeoutExceptionError):
        busy_loop(0.1, 0.4, swallow_exc=False)


def test_sympy_timeout():
    x = symbols("x")
    expr1 = exp(sin(x)) * (1 + sin(x) ** 10) ** 5
    expr2 = exp(sin(x)) * (1 + sin(x) ** 2) ** 125
    with ThreadingTimeout(0.1) as ctx:
        eq = Eq(expr1, expr2)
        simplify(eq.lhs - eq.rhs)  # type: ignore
    assert ctx.state == TimeoutState.TIMED_OUT

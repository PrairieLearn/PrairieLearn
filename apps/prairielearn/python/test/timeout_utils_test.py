import math
import time
from random import randint

import pytest
from prairielearn.timeout_utils import (
    ThreadingTimeout,
    TimeoutExceptionError,
    TimeoutState,
)
from sympy import Eq, exp, simplify, sin, symbols


def busy_loop(timeout: float, busy_duration: float, *, swallow_exc: bool = True):
    x = 0
    with ThreadingTimeout(timeout, swallow_exc=swallow_exc) as ctx:
        end = time.perf_counter() + busy_duration
        while time.perf_counter() < end:
            x += randint(0, 10**8)
            x = math.sqrt(x)
    return (ctx, x)


def test_short_execution():
    ctx, _ = busy_loop(0.4, 0.1)
    assert ctx.state == TimeoutState.EXECUTED


def test_long_execution():
    ctx, _ = busy_loop(0.2, 0.4)
    assert ctx.state == TimeoutState.TIMED_OUT


def test_timeout_exc():
    with pytest.raises(TimeoutExceptionError):
        busy_loop(0.1, 0.4, swallow_exc=False)


def test_sympy_timeout():
    x = symbols("x")
    expr1 = exp(sin(x)) * (1 + sin(x) ** 10) ** 5
    expr2 = exp(sin(x)) * (1 + sin(x) ** 2) ** 125
    with ThreadingTimeout(0.5) as ctx:
        eq = Eq(expr1, expr2)
        simplify(eq.lhs - eq.rhs)  # type: ignore
    assert ctx.state == TimeoutState.TIMED_OUT

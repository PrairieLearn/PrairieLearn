import threading
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
    # Use exponents large enough that the computation will reliably take much
    # longer than the timeout. Threading-based timeouts in Python can have
    # inconsistent timing, so we want a large margin of safety.
    expr1 = exp(sin(x)) * (1 + sin(x) ** 10) ** 50
    expr2 = exp(sin(x)) * (1 + sin(x) ** 2) ** 500
    with ThreadingTimeout(0.1) as ctx:
        eq = Eq(expr1, expr2)
        simplify(eq.lhs - eq.rhs)  # type: ignore
    assert ctx.state == TimeoutState.TIMED_OUT


def test_nested_timeout_preserves_outer_deadline():
    outer = ThreadingTimeout(0.2)
    inner = ThreadingTimeout(1.0)

    with outer:
        time.sleep(0.05)
        with inner:
            time.sleep(0.4)

    assert outer.state == TimeoutState.TIMED_OUT
    assert inner.state == TimeoutState.INTERRUPTED


def test_timeout_requires_main_thread():
    result: list[BaseException] = []

    def create_timeout():
        try:
            ThreadingTimeout(0.1)
        except BaseException as exc:
            result.append(exc)

    thread = threading.Thread(target=create_timeout)
    thread.start()
    thread.join()

    assert len(result) == 1
    assert isinstance(result[0], RuntimeError)
    assert "ThreadingTimeout requires the main thread." in str(result[0])

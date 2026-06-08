import signal
import threading
import time
from types import FrameType

import pytest
from prairielearn.timeout_utils import (
    SignalTimeout,
    TimeoutExceptionError,
    TimeoutState,
)
from sympy import Eq, exp, simplify, sin, symbols


def busy_loop(timeout: float, busy_duration: float, *, swallow_exc: bool = True):
    with SignalTimeout(timeout, swallow_exc=swallow_exc) as ctx:
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
    with SignalTimeout(0.1) as ctx:
        eq = Eq(expr1, expr2)
        simplify(eq.lhs - eq.rhs)
    assert ctx.state == TimeoutState.TIMED_OUT


def test_nested_timeout_preserves_outer_deadline():
    outer = SignalTimeout(0.2)
    inner = SignalTimeout(1.0)

    with outer:
        time.sleep(0.05)
        with inner:
            time.sleep(0.4)

    assert outer.state == TimeoutState.TIMED_OUT
    assert inner.state == TimeoutState.INTERRUPTED


def test_nested_timeout_teardown_tolerates_expired_outer():
    for _ in range(100):
        outer = SignalTimeout(0.0005)
        inner = SignalTimeout(1.0)

        with outer, inner:
            time.sleep(0.002)

        assert outer.state == TimeoutState.TIMED_OUT
        assert inner.state == TimeoutState.INTERRUPTED


def test_timeout_rejects_preexisting_signal_alarm_without_canceling_it():
    class PreexistingAlarmError(Exception):
        pass

    def alarm_handler(_signum: int, _frame: FrameType | None) -> None:
        raise PreexistingAlarmError

    previous_handler = signal.signal(signal.SIGALRM, alarm_handler)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, 0.1)
    try:
        with (
            pytest.raises(RuntimeError, match="ITIMER_REAL timer is active"),
            SignalTimeout(1.0),
        ):
            pass
        with pytest.raises(PreexistingAlarmError):
            time.sleep(0.2)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
        if previous_timer[0] > 0:
            signal.setitimer(signal.ITIMER_REAL, *previous_timer)


def test_timeout_requires_main_thread():
    result: list[BaseException] = []

    def create_timeout():
        try:
            SignalTimeout(0.1)
        except BaseException as exc:
            result.append(exc)

    thread = threading.Thread(target=create_timeout)
    thread.start()
    thread.join()

    assert len(result) == 1
    assert isinstance(result[0], RuntimeError)
    assert "SignalTimeout requires the main thread." in str(result[0])

"""Utilities for performing local, signal-based timeouts.
Implementation from https://github.com/glenfant/stopit under the MIT license.

```python
from prairielearn.timeout_utils import ...
```
"""

from __future__ import annotations

import signal
import threading
import time
from enum import IntEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from types import FrameType, TracebackType
    from typing import Self


class TimeoutState(IntEnum):
    # Possible values for the ``state`` attribute in BaseTimeout
    EXECUTED = 0
    EXECUTING = 1
    TIMED_OUT = 2
    INTERRUPTED = 3
    CANCELED = 4


class TimeoutExceptionError(Exception):
    """Raised when the block under context management takes longer to complete
    than the allowed maximum timeout value.
    """

    def __init__(self, timeout: SignalTimeout | None = None) -> None:
        super().__init__()
        self.timeout = timeout


class _SignalTimeoutState:
    def __init__(self) -> None:
        self.active_timeouts: list[SignalTimeout] = []
        self.prev_handler: signal._HANDLER | None = None


_signal_state = _SignalTimeoutState()


def _schedule_next_signal_alarm(now: float | None = None) -> None:
    executable_timeouts = [
        timeout
        for timeout in _signal_state.active_timeouts
        if timeout.state == TimeoutState.EXECUTING
    ]
    if not executable_timeouts:
        signal.setitimer(signal.ITIMER_REAL, 0)
        return

    if now is None:
        now = time.monotonic()

    next_timeout = min(executable_timeouts, key=lambda t: t._deadline)
    signal.setitimer(signal.ITIMER_REAL, max(next_timeout._deadline - now, 1e-6))


def _signal_timeout_handler(_signum: int, _frame: FrameType | None) -> None:
    now = time.monotonic()
    executable_timeouts = [
        timeout
        for timeout in _signal_state.active_timeouts
        if timeout.state == TimeoutState.EXECUTING
    ]
    if not executable_timeouts:
        signal.setitimer(signal.ITIMER_REAL, 0)
        return

    timed_out = min(executable_timeouts, key=lambda t: t._deadline)
    if timed_out._deadline > now:
        _schedule_next_signal_alarm(now)
        return

    timed_out.state = TimeoutState.TIMED_OUT
    signal.setitimer(signal.ITIMER_REAL, 0)
    raise TimeoutExceptionError(timed_out)


class SignalTimeout:
    """Context manager for limiting the execution time of a block.

    Parameters:
        seconds (float | int): duration to run the context manager block
        swallow_exc (bool): ``False`` if you want to manage ``TimeoutExceptionError``
            (or any other) in an outer ``try ... except`` structure. ``True`` (default)
            if you just want to check the execution of the block with the
            ``state`` attribute of the context manager.
    """

    def __init__(self, seconds: float, *, swallow_exc: bool = True) -> None:
        self.seconds = seconds
        self.swallow_exc = swallow_exc
        self.state = TimeoutState.EXECUTED
        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError("SignalTimeout requires the main thread.")
        if not hasattr(signal, "SIGALRM"):
            raise RuntimeError("SignalTimeout requires SIGALRM support.")
        self._deadline: float = 0.0

    def __bool__(self) -> bool:
        """Return whether the context is not TIMED_OUT or INTERRUPTED"""
        return self.state in (
            TimeoutState.EXECUTED,
            TimeoutState.EXECUTING,
            TimeoutState.CANCELED,
        )

    def __repr__(self) -> str:
        """Debug helper"""
        return f"<{self.__class__.__name__} in state: {self.state}>"

    def __enter__(self) -> Self:
        """Initializes the interrupt and updates state."""
        self.state = TimeoutState.EXECUTING
        self.setup_interrupt()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        """Manages exceptions & timeout."""
        if exc_type is None:
            self.state = TimeoutState.EXECUTED
            self.suppress_interrupt()
            return False
        if exc_type is not TimeoutExceptionError:
            self.suppress_interrupt()
            return False
        assert isinstance(exc_value, TimeoutExceptionError)
        is_own_timeout = exc_value.timeout is None or exc_value.timeout is self
        # Set state before suppress_interrupt: rescheduling the next alarm can
        # fire immediately if an outer deadline has already passed, and the
        # handler must not preempt this assignment.
        if not is_own_timeout:
            self.state = TimeoutState.INTERRUPTED
        self.suppress_interrupt()
        return self.swallow_exc if is_own_timeout else False

    def cancel(self) -> None:
        """In case in the block you realize you don't need anymore
        limitation
        """
        self.state = TimeoutState.CANCELED
        self.suppress_interrupt()

    def setup_interrupt(self) -> None:
        """Setting up the resource that interrupts the block"""
        self._deadline = time.monotonic() + self.seconds
        if not _signal_state.active_timeouts:
            previous_handler = signal.getsignal(signal.SIGALRM)
            prev_timer = signal.setitimer(signal.ITIMER_REAL, 0)
            if prev_timer[0] > 0:
                signal.setitimer(signal.ITIMER_REAL, *prev_timer)
                raise RuntimeError(
                    "SignalTimeout cannot run while an ITIMER_REAL timer is active."
                )
            _signal_state.prev_handler = previous_handler
            signal.signal(signal.SIGALRM, _signal_timeout_handler)
        _signal_state.active_timeouts.append(self)
        _schedule_next_signal_alarm()

    def suppress_interrupt(self) -> None:
        """Removing the resource that interrupts the block"""
        if self not in _signal_state.active_timeouts:
            return

        _signal_state.active_timeouts.remove(self)

        if _signal_state.active_timeouts:
            _schedule_next_signal_alarm()
        else:
            signal.setitimer(signal.ITIMER_REAL, 0)
            if _signal_state.prev_handler is not None:
                signal.signal(signal.SIGALRM, _signal_state.prev_handler)
            _signal_state.prev_handler = None


# The previous implementation was based on threading.Timer,
# which had asynchronous behavior. See https://github.com/PrairieLearn/PrairieLearn/pull/14417
class ThreadingTimeout(SignalTimeout):
    """Deprecated alias for SignalTimeout."""

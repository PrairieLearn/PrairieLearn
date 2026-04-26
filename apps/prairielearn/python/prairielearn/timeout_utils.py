"""Utilities for performing local, threaded timeouts.
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

    from typing_extensions import Self


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

    def __init__(self, timeout: ThreadingTimeout | None = None) -> None:
        super().__init__()
        self.timeout = timeout


class _SignalTimeoutState:
    def __init__(self) -> None:
        self.active_timeouts: list[ThreadingTimeout] = []
        self.prev_handler: signal._HANDLER | None = None
        self.prev_timer: tuple[float, float] | None = None


_signal_state = _SignalTimeoutState()


def _schedule_next_signal_alarm(now: float | None = None) -> None:
    if not _signal_state.active_timeouts:
        signal.setitimer(signal.ITIMER_REAL, 0)
        return

    if now is None:
        now = time.monotonic()

    next_timeout = min(
        _signal_state.active_timeouts,
        key=lambda timeout: (
            timeout._deadline if timeout._deadline is not None else float("inf")
        ),
    )
    if next_timeout._deadline is None:
        return

    signal.setitimer(signal.ITIMER_REAL, max(next_timeout._deadline - now, 1e-6))


def _signal_timeout_handler(_signum: int, _frame: FrameType | None) -> None:
    now = time.monotonic()
    expired_timeouts = [
        timeout
        for timeout in _signal_state.active_timeouts
        if timeout._deadline is not None and timeout._deadline <= now
    ]

    if not expired_timeouts:
        _schedule_next_signal_alarm(now)
        return

    timed_out = min(
        expired_timeouts,
        key=lambda timeout: (
            timeout._deadline if timeout._deadline is not None else float("inf")
        ),
    )
    for timeout in expired_timeouts:
        timeout.state = TimeoutState.TIMED_OUT
    raise TimeoutExceptionError(timed_out)


class ThreadingTimeout:
    """Context manager for limiting in the time the execution of a block

    Parameters:
        seconds (float | int): duration to run the context manager block
        swallow_exc (bool): ``False`` if you want to manage ``TimeoutException``
            (or any other) in an outer ``try ... except`` structure. ``True`` (default)
            if you just want to check the execution of the block with the
            ``state`` attribute of the context manager.
    """

    def __init__(self, seconds: float, *, swallow_exc: bool = True) -> None:
        self.seconds = seconds
        self.swallow_exc = swallow_exc
        self.state = TimeoutState.EXECUTED
        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError("ThreadingTimeout requires the main thread.")
        if (
            not hasattr(signal, "SIGALRM")
            or not hasattr(signal, "ITIMER_REAL")
            or not hasattr(signal, "setitimer")
        ):
            raise RuntimeError("ThreadingTimeout requires SIGALRM support.")
        self._deadline: float | None = None

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
        if exc_type is TimeoutExceptionError:
            timeout = (
                exc_value.timeout
                if isinstance(exc_value, TimeoutExceptionError)
                else None
            )
            if timeout is not None and timeout is not self:
                self.state = TimeoutState.INTERRUPTED
            self.suppress_interrupt()
            if timeout is not None and timeout is not self:
                return False
            return self.swallow_exc
        else:
            if exc_type is None:
                self.state = TimeoutState.EXECUTED
            self.suppress_interrupt()
        return False

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
            _signal_state.prev_handler = signal.signal(
                signal.SIGALRM, _signal_timeout_handler
            )
            _signal_state.prev_timer = signal.setitimer(signal.ITIMER_REAL, 0)
        _signal_state.active_timeouts.append(self)
        _schedule_next_signal_alarm()

    def suppress_interrupt(self) -> None:
        """Removing the resource that interrupts the block"""
        if self not in _signal_state.active_timeouts:
            return

        _signal_state.active_timeouts.remove(self)
        self._deadline = None

        if _signal_state.active_timeouts:
            _schedule_next_signal_alarm()
        else:
            signal.setitimer(signal.ITIMER_REAL, 0)
            if _signal_state.prev_handler is not None:
                signal.signal(signal.SIGALRM, _signal_state.prev_handler)
            if _signal_state.prev_timer is not None and _signal_state.prev_timer[0] > 0:
                signal.setitimer(signal.ITIMER_REAL, *_signal_state.prev_timer)
            _signal_state.prev_handler = None
            _signal_state.prev_timer = None

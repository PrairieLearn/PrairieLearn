"""Utilities for performing local, threaded timeouts.
Implementation from https://github.com/glenfant/stopit under the MIT license.

```python
from prairielearn.timeout_utils import ...
```
"""

import ctypes
import signal
import threading
from enum import IntEnum
from types import FrameType, TracebackType

from typing_extensions import Self

tid_ctype = ctypes.c_ulong


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
        # We prefer signal.SIGALRM over PyThreadState_SetAsyncExc because the
        # latter only interrupts Python bytecode execution — async exceptions
        # are checked between bytecode instructions in CPython's eval loop
        # (see https://github.com/python/cpython/blob/3.13/Python/ceval_gil.c#L1320-L1330).
        # When the target thread is blocked in C code (e.g. SymPy's C
        # extensions, time.sleep), the async exception is never delivered and
        # the timeout hangs. SIGALRM is an OS-level signal that reliably
        # interrupts C extensions.
        #
        # SIGALRM can only be used from the main thread. In production, grading
        # code always runs in the main thread of forked zygote workers, and
        # tests run in the main thread as well, so we should always take this
        # path. The PyThreadState_SetAsyncExc fallback is kept in case future
        # changes cause this code to run outside the main thread.
        self._use_signal = (
            threading.current_thread() is threading.main_thread()
            and hasattr(signal, "SIGALRM")
        )
        if self._use_signal:
            self._prev_handler: signal._HANDLER | None = None
            self._prev_timer: float = 0.0
        else:
            tid = threading.current_thread().ident
            if tid is None:
                raise RuntimeError(
                    "Cannot create timeout context: thread ID is unavailable."
                )
            self.target_tid = tid
        self.timer = None

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
            if self.state != TimeoutState.TIMED_OUT:
                self.state = TimeoutState.INTERRUPTED
            self.suppress_interrupt()
            return self.swallow_exc
        else:
            if exc_type is None:
                self.state = TimeoutState.EXECUTED
            self.suppress_interrupt()
        return False

    def stop(self) -> None:
        """Called by timer thread at timeout. Raises a Timeout exception in the
        caller thread
        """
        self.state = TimeoutState.TIMED_OUT
        async_raise(self.target_tid, TimeoutExceptionError)

    def cancel(self) -> None:
        """In case in the block you realize you don't need anymore
        limitation
        """
        self.state = TimeoutState.CANCELED
        self.suppress_interrupt()

    def _alarm_handler(self, _signum: int, _frame: FrameType | None) -> None:
        self.state = TimeoutState.TIMED_OUT
        raise TimeoutExceptionError

    def setup_interrupt(self) -> None:
        """Setting up the resource that interrupts the block"""
        if self._use_signal:
            self._prev_handler = signal.signal(signal.SIGALRM, self._alarm_handler)
            # setitimer returns (previous_interval, previous_remaining); we save remaining
            prev = signal.setitimer(signal.ITIMER_REAL, self.seconds)
            self._prev_timer = prev[0]
        else:
            self.timer = threading.Timer(self.seconds, self.stop)
            self.timer.start()

    def suppress_interrupt(self) -> None:
        """Removing the resource that interrupts the block"""
        if self._use_signal:
            # Cancel our timer
            signal.setitimer(signal.ITIMER_REAL, 0)
            # Restore previous handler
            if self._prev_handler is not None:
                signal.signal(signal.SIGALRM, self._prev_handler)
            # Restore previous timer if there was one
            if self._prev_timer > 0:
                signal.setitimer(signal.ITIMER_REAL, self._prev_timer)
        elif self.timer is not None:
            self.timer.cancel()
        else:
            raise ValueError("No timer has been initialized")


def async_raise(target_tid: int, exception: type[Exception]) -> None:
    """Raises an asynchronous exception in another thread.
    Read http://docs.python.org/c-api/init.html#PyThreadState_SetAsyncExc
    for further enlightenments.

    Parameters:
        target_tid: target thread identifier
        exception: Exception class to be raised in that thread

    Raises:
        ValueError: If the thread ID is invalid.
        SystemError: If the process fails to set AsyncExec
    """
    # TODO: Update this code when we are running no-GIL Python version 3.14+.

    # Ensuring and releasing GIL are useless since we're not in C
    # gil_state = ctypes.pythonapi.PyGILState_Ensure()
    ret = ctypes.pythonapi.PyThreadState_SetAsyncExc(
        tid_ctype(target_tid), ctypes.py_object(exception)
    )
    # ctypes.pythonapi.PyGILState_Release(gil_state)
    if ret == 0:
        raise ValueError(f"Invalid thread ID {target_tid}")
    if ret > 1:
        ctypes.pythonapi.PyThreadState_SetAsyncExc(tid_ctype(target_tid), None)
        raise SystemError("PyThreadState_SetAsyncExc failed")

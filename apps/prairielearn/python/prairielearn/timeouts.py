"""Utilities for performing local, threaded timeouts.
Implemenation from https://github.com/glenfant/stopit under the MIT license.

```python
from prairielearn.timeouts import ...
```
"""

import ctypes
import threading
from enum import IntEnum
from types import TracebackType

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


class BaseTimeout:
    """Context manager for limiting in the time the execution of a block

    :param seconds: ``float`` or ``int`` duration enabled to run the context
      manager block
    :param swallow_exc: ``False`` if you want to manage the
      ``TimeoutException`` (or any other) in an outer ``try ... except``
      structure. ``True`` (default) if you just want to check the execution of
      the block with the ``state`` attribute of the context manager.
    """

    def __init__(self, seconds: float, *, swallow_exc: bool = True) -> None:
        self.seconds = seconds
        self.swallow_exc = swallow_exc
        self.state = TimeoutState.EXECUTED

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

    def cancel(self) -> None:
        """In case in the block you realize you don't need anymore
        limitation
        """
        self.state = TimeoutState.CANCELED
        self.suppress_interrupt()

    # Methods must be provided by subclasses
    def suppress_interrupt(self) -> None:
        """Removes/neutralizes the feature that interrupts the executed block"""
        raise NotImplementedError

    def setup_interrupt(self) -> None:
        """Installs/initializes the feature that interrupts the executed block"""
        raise NotImplementedError


def async_raise(target_tid: int, exception: type[Exception]) -> None:
    """Raises an asynchronous exception in another thread.
    Read http://docs.python.org/c-api/init.html#PyThreadState_SetAsyncExc
    for further enlightenments.

    :param target_tid: target thread identifier
    :param exception: Exception class to be raised in that thread

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


class ThreadingTimeout(BaseTimeout):
    """Context manager for limiting in the time the execution of a block
    using asynchronous threads launching exception.

    See :class:`stopit.utils.BaseTimeout` for more information
    """

    def __init__(self, seconds: float, *, swallow_exc: bool = True) -> None:
        super().__init__(seconds, swallow_exc=swallow_exc)
        tid = threading.current_thread().ident
        self.target_tid = tid if tid is not None else -1
        self.timer = None

    def stop(self) -> None:
        """Called by timer thread at timeout. Raises a Timeout exception in the
        caller thread
        """
        self.state = TimeoutState.TIMED_OUT
        async_raise(self.target_tid, TimeoutExceptionError)

    # Required overrides
    def setup_interrupt(self) -> None:
        """Setting up the resource that interrupts the block"""
        self.timer = threading.Timer(self.seconds, self.stop)
        self.timer.start()

    def suppress_interrupt(self) -> None:
        """Removing the resource that interrupts the block"""
        if self.timer is not None:
            self.timer.cancel()
        else:
            raise ValueError("No timer has been initialized")

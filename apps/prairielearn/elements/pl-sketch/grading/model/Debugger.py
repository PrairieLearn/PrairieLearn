from typing import Any


class Debugger:
    """An class that allows you to store a debug message as well as optional vars that help construct the debug message."""

    def __init__(self, grader_name: str, toolid: str, tolerance: int):
        self.message = (
            "Grader : "
            + grader_name
            + " | Tool : "
            + toolid
            + " | Tolerance: "
            + str(tolerance)
        )
        self.var1: Any = None
        self.var2: Any = None
        self.var3: Any = None

    def add(self, string: str) -> None:
        self.message += "\n"
        self.message += string

    def clear_vars(self) -> None:
        self.var1 = None
        self.var2 = None
        self.var3 = None

    def get_message_as_list_and_clear(self) -> list[str]:
        self.clear_vars()
        ls = self.message.split("\n")
        if len(ls) == 1:
            ls.append("No submission or incomplete debug setup.")
        return ls

    def get_message_and_clear(self) -> str:
        self.clear_vars()
        return self.message

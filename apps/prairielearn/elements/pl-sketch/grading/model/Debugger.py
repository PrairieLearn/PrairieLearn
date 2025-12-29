class Debugger:
    """An class that allows you to store a debug message as well as optional vars that help construct the debug message."""

    def __init__(self, grader_name, toolid, tolerance, point_tolerance=None):
        self.message = (
            "Grader : "
            + grader_name
            + " | Tool : "
            + toolid
            + " | Tolerance: "
            + str(tolerance)
            + (
                " | (Alt) Point Tolerance: " + str(point_tolerance)
                if point_tolerance
                else ""
            )
        )
        self.var1 = None
        self.var2 = None
        self.var3 = None

    def add(self, str):
        self.message += "\n"
        self.message += str

    def clear_vars(self):
        self.var1 = None
        self.var2 = None
        self.var3 = None

    def get_message_as_list_and_clear(self):
        self.clear_vars()
        ls = self.message.split("\n")
        if len(ls) == 1:
            ls.append("No submission or incomplete debug setup.")
        return ls

    def get_message_and_clear(self):
        self.clear_vars()
        return self.message

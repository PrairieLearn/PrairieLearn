#!/usr/bin/python3


import cgrader


class EmailGrader(cgrader.CGrader):
    def tests(self):
        self.test_compile_file(
            "validator.cpp",
            "emailtest",
            add_c_file="/grade/tests/test.cpp",
            flags="-std=c++17",
            points=10,
        )

        self.run_catch2_suite("./test")


g = EmailGrader()
g.start()

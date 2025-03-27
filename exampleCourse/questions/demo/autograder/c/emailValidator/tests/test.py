#!/usr/bin/python3


import cgrader


class EmailGrader(cgrader.CPPGrader):
    def tests(self):
        import os

        self.result["message"] += os.popen("ls -la ..").read()
        self.result["message"] += os.popen("ls ../student").read()
        self.result["message"] += os.popen("ls ../shared").read()
        self.test_compile_file(
            "/grade/tests/test.cpp",
            "test",
            add_c_file=[
                "catch_amalgamated.cpp",
                "solution.cpp",
            ],
            flags=[
                "-std=c++20",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-O0",
                "-g",
            ],
            points=10,
        )

        self.run_catch2_suite("./test")


g = EmailGrader()
g.start()

#!/usr/bin/python3


import cgrader


class EmailGrader(cgrader.CPPGrader):
    def tests(self):
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
                "-gdwarf-4",
                "-fsanitize=address,undefined,implicit-conversion,local-bounds",
                "-fno-omit-frame-pointer",
                "-fno-optimize-sibling-calls",
                "-fsanitize-address-use-after-return=always",
            ],
            points=10,
        )

        self.run_catch2_suite("./test")


g = EmailGrader()
g.start()

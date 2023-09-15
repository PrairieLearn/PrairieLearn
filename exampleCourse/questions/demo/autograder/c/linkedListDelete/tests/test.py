#! /usr/bin/python3

import cgrader


class TestGrader(cgrader.CGrader):
    def tests(self):
        self.test_compile_file(
            "deletefirst.c",
            "main",
            add_c_file="/grade/tests/main.c",
            flags="-I/grade/tests",
            pkg_config_flags="check",
            points=0,
            enable_asan=True,
        )
        self.run_check_suite("./main", use_iteration=True)


g = TestGrader()
g.start()

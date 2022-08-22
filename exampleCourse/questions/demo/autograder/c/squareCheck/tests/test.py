#! /usr/bin/python3

import cgrader

class DemoGrader(cgrader.CGrader):

    def tests(self):
        
        self.test_compile_file('square.c', 'main', add_c_file='/grade/tests/main.c',
                               # The following must be included if compiling a Check test
                               pkg_config_flags='check')
        self.run_check_suite('./main', use_iteration=True)

g = DemoGrader()
g.start()

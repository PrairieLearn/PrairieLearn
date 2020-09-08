#! /usr/bin/python3

import sys, math, sympy
import cgrader

class DemoGrader(cgrader.CGrader):

    def tests(self):
        
        self.test_compile_file('square.c', 'main', main_file='/grade/tests/main.c')

        for inval in [0, 1, 2, 3, 5, 10, -20, 100, 512, -23, -4]:
            outval = inval ** 2
            self.test_send_in_check_out('./main', None, '%+d' % outval, args = [str(inval)])

g = DemoGrader()
g.start()

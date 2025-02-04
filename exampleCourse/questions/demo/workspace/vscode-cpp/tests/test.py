#! /usr/bin/python3

import cgrader


class QuestionGrader(cgrader.CPPGrader):
    def tests(self):
        self.test_compile_file(
            "source.cpp", "source", flags="-Wall -Wextra -pedantic -Werror"
        )
        self.test_run(
            "./source",
            input="5 4\n",
            exp_output=[
                "Enter the length: \n",
                "Enter the width: \n",
                "The perimeter of the rectangle is: 18\n",
            ],
            must_match_all_outputs="partial",
        )
        self.test_run(
            "./source",
            input="3 3\n",
            exp_output=[
                "Enter the length: \n",
                "Enter the width: \n",
                "The perimeter of the rectangle is: 12\n",
            ],
            must_match_all_outputs="partial",
        )


g = QuestionGrader()
g.start()

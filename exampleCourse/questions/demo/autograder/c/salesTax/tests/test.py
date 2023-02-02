#! /usr/bin/python3

import cgrader


class Grader(cgrader.CPPGrader):
    def tests(self):
        self.test_compile_file("tax.cpp", "tax")

        tax = (
            1
            + (
                float(self.data["params"]["state_tax"])
                + float(self.data["params"]["county_tax"])
                + float(self.data["params"]["city_tax"])
            )
            / 100
        )

        for inval in [10.23, 121.14, 210.11, 1.92, 40.23]:
            outval = inval * tax
            self.test_run("./tax", "%s\n" % inval, "%0.2f" % outval)


g = Grader()
g.start()

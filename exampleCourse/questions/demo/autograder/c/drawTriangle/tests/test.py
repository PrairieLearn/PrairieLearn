#! /usr/bin/python3
import base64
import io
import itertools
import json

import cgrader
import matplotlib.pyplot as plt


class TestGrader(cgrader.CGrader):
    def tests(self):
        # Generates all correct outputs
        def generateOutput(l, x, y):
            v1x = x
            v1y = y
            v2x = v1x
            v2y = v1y - l
            v3x = v2x + l
            v3y = v2y

            p1 = f"({v1x},{v1y})"
            p2 = f"({v2x},{v2y})"
            p3 = f"({v3x},{v3y})"

            l1 = f"{p2}-{p1}"
            l2 = f"{p2}-{p3}"
            l3 = f"{p1}-{p3}"

            return [" ".join(j) for j in itertools.permutations([l1, l2, l3])]

        self.test_compile_file("drawTri.c", "main", main_file="/grade/tests/main.c")
        self.run_command("touch image.json", sandboxed=False)
        self.change_mode("image.json", "666")

        for l, x, y in [[2, 0, 4], [3, 0, 0], [1, 1, 1], [99, -10, -400]]:
            test = self.test_run("./main", f"{l} {x} {y}\n", generateOutput(l, x, y))
            try:
                with open("image.json", "r") as f:
                    pts = json.load(f)
                    plt.clf()
                    for i in range(1, len(pts), 4):
                        plt.plot([pts[i], pts[i + 2]], [pts[i + 1], pts[i + 3]])
                    buf = io.BytesIO()
                    plt.savefig(buf, format="png")
                    url = "data:image/png;base64, " + base64.encodebytes(
                        buf.getvalue()
                    ).decode("ascii")
                    test["images"] = [{"label": "Result", "url": url}]
            except Exception:
                pass


g = TestGrader()
g.start()

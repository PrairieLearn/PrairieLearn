import pprint

import prairielearn as pl


def generate(data: pl.QuestionData):
    complex_object = {
        (1, 2): "hi",
        (0, 0): "origin",
        (2, 2): "another point",
        (3, 3): "yet another point",
    }

    data["params"]["my_object_string"] = pprint.pformat(complex_object)

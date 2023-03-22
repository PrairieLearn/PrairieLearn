import random
import numpy as np
import prairielearn as pl

import numpy as np
import prairielearn as pl


def generate(data):

    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    a16 = random.randint(0xA, 0x1F)
    b16 = random.randint(0xA, 0x1F)

    # Compute answer
    c = a + b
    c16 = a16 + b16

    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b

    data["params"]["a16"] = f"{a16:X}"
    data["params"]["b16"] = f"{b16:X}"

    # Release correct answer
    data["correct_answers"]["c_1"] = c
    data["correct_answers"]["c_2"] = c
    data["correct_answers"]["c_3"] = str(c)
    data["correct_answers"]["c_4"] = str(c)
    data["correct_answers"]["c_6"] = str(c16)

    c_7 = "9007199254740991999"
    data["correct_answers"]["c_7"] = c_7
    data["params"]["c_7"] = c_7

    d = 16
    data["params"]["d"] = d
    data["correct_answers"]["c_8"] = pl.to_json(np.int64(d), np_encoding_version=2)

def grade(data):
    for entry in data["submitted_answers"]:
        print(entry, type(entry))

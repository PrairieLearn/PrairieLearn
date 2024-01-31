import random

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
    data["correct_answers"]["c_4"] = str(c)
    data["correct_answers"]["c_5"] = str(c)
    data["correct_answers"]["c_7_b16"] = c16
    data["correct_answers"]["c_7_b2"] = c16

    c_large = "9007199254740991999"
    data["correct_answers"]["c_large"] = c_large

    d = 16
    data["params"]["d"] = d
    data["correct_answers"]["c_np"] = pl.to_json(np.int64(d), np_encoding_version=2)

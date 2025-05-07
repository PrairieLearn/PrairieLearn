import random

import prairielearn as pl


def generate(data: pl.QuestionData):
    a = random.randint(100, 200)
    ans = f"{a:b}"
    data["params"]["a"] = a
    data["correct_answers"]["b"] = ans

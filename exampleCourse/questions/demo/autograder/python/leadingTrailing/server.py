import prairielearn as pl

LEADING_CODE = """def f(x):
    return x**2


def df(x):
    return 2 * x


def gradient_descent(x, alpha):
    grad_f = df(x)
"""
TRAILING_CODE = "    return x_new\n"


def generate(data):
    data["params"]["leading_code"] = LEADING_CODE
    data["params"]["trailing_code"] = TRAILING_CODE
    data["params"]["names_from_user"] = [{"name": "gradient_descent"}]


def parse(data):
    answer = data["submitted_answers"]["answer"].strip()
    code = LEADING_CODE + "    " + answer + "\n" + TRAILING_CODE
    pl.add_submitted_file(data, "student_code.py", raw_contents=code)

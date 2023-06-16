import numpy as np


def generate(data):
    length = 5

    s = np.random.choice([0, 1])
    shift = 127
    c = np.random.randint(128, 133)
    m = c - shift
    f = np.append(np.random.choice([0, 1], size=length), 1)

    if s == 0:
        num_str = "+"
    else:
        num_str = "-"

    num_str += str(1)
    f_str = ""
    for i, val in enumerate(f):
        if i == m:
            num_str += "."
        num_str += str(val)
        f_str += str(val)

    c_bin = bin(c)[2:]

    data["params"]["number"] = num_str
    data["correct_answers"]["sign"] = str(s)
    data["correct_answers"]["exponent"] = c_bin
    data["correct_answers"]["significand"] = f_str

    # data["params"]["debug"] = [m, s, ]

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = "<hr><p>Remember we are converting <strong>binary</strong> to <strong>single precision</strong></p>"
        feedback += "<p>Keep in mind, $(-1)^s 1.f\cdot 2^m$</p>"
        if data["correct_answers"]["sign"] != data["submitted_answers"]["sign"]:
            feedback += "<p><strong>sign: </strong> $s=0 \\rightarrow (-1)^0 = 1$ and $s=1 \\rightarrow (-1)^1 = -1$</p>"
        if data["correct_answers"]["exponent"] != data["submitted_answers"]["exponent"]:
            feedback += "<p><strong>exponent: </strong>Using the notation from the <strong>reference</strong>, the exponent is $m + 127$ in binary.</p>"
        if (
            data["correct_answers"]["significand"]
            != data["submitted_answers"]["significand"]
        ):
            feedback += "<p><strong>Significand: </strong>When representing the binary to the format above, the $f$ is the significand. (e.g., for binary 1.1001, the $f$ is 1001)</p>"
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback

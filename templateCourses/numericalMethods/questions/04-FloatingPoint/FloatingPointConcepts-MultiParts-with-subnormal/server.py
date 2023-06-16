import random


def generate(data):
    s_bits = random.choice([3, 4])
    m_range = random.choice([4, 5, 6])
    s = ""
    for i in range(1, s_bits + 1):
        s += "b_" + str(i)
    representation = (
        "$x = \\pm 1." + s + f"\\times 2^m$ for $m \\in [-{m_range},{m_range}]$"
    )
    data["params"]["representation"] = representation

    lfp = 2**m_range
    for i in range(1, s_bits + 1):
        lfp += 2 ** (m_range - i)

    # for 3
    data["correct_answers"]["snfp"] = 2 ** (-m_range)  # 0.03125
    data["correct_answers"]["ssfp"] = 2 ** (-m_range - s_bits)  # 0.03125
    data["correct_answers"]["lfp"] = lfp  # 60

    # subnormal only when exponent at lowest and first implicit bit 0
    # count all possible bit combinations for s_bits (except 0)
    # multiply by 2 for positive and negative
    data["correct_answers"]["n"] = (2**s_bits - 1) * 2

    data["correct_answers"]["emach"] = 2 ** (-s_bits)  # 0.125

    return data


def grade(data):
    if data["score"] != 1.0:
        feedback = (
            "You may consider check the page 12 and 17 of the annotated FP slides "
        )
    else:
        feedback = ""

    data["feedback"]["question_feedback"] = feedback

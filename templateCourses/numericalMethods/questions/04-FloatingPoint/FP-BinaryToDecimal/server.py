import random


def binary_to_dec(binary_string):
    # this is only for the exponent part
    res = 0
    str_len = len(binary_string)
    for i in range(0, str_len):
        res += int(binary_string[i]) * 2 ** (str_len - i - 1)
    return res


def generate(data):

    f1 = 0.57421875
    f2 = 0.32421875

    options = [
        "10000001010",
        "10000001011",
        "10000010000",
        "10000000111",
        "10000001110",
        "10000001101",
    ]
    string_binary_vector_1 = random.choice(options)
    string_binary_vector_2 = random.choice(options)
    c1 = binary_to_dec(string_binary_vector_1)
    c2 = binary_to_dec(string_binary_vector_2)

    data["params"]["machine_number_1"] = (
        "\hspace{3mm}0\hspace{2mm}"
        + string_binary_vector_1
        + "\hspace{2mm}  10010011000000\cdot \cdot \cdot 0"
    )
    data["params"]["machine_number_2"] = (
        "\hspace{3mm}1\hspace{2mm}"
        + string_binary_vector_2
        + "\hspace{2mm}  01010011000000\cdot \cdot \cdot 0"
    )
    data["correct_answers"]["decimal_1"] = (2 ** (c1 - 1023)) * (1 + f1)
    data["correct_answers"]["decimal_2"] = -1 * (2 ** (c2 - 1023)) * (1 + f2)

    data["params"]["debug"] = {}
    data["params"]["debug"]["decimal_1"] = [c1, f1]
    data["params"]["debug"]["decimal_2"] = [c2, f2]

    return data


def grade(data):
    if data["score"] != 1.0 and ("debug" in data["params"]):
        feedback = "<hr>"

        feedback += "Check if you have the calculated the following correctly:"
        if (
            data["submitted_answers"]["decimal_1"]
            != data["correct_answers"]["decimal_1"]
        ):
            c1, f1 = data["params"]["debug"]["decimal_1"]
            feedback += "<p> <strong>a) </strong> $c=%d, f=%f$" % (c1, f1)
        if (
            data["submitted_answers"]["decimal_2"]
            != data["correct_answers"]["decimal_2"]
        ):
            c1, f1 = data["params"]["debug"]["decimal_2"]
            feedback += "<p> <strong>b) </strong> $c=%d, f=%f$" % (c1, f1)
    else:
        feedback = ""
    data["feedback"]["question_feedback"] = feedback

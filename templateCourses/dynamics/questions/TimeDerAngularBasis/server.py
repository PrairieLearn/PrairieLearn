import random


def generate(data):

    case = random.choice([True, False])

    true_list = [
        "\\dot{\\hat{e}}_\\theta  = -\\dot{\\theta} \\, \\hat{e}_r",
        "\\dot{\\hat{e}}_\\theta  = -\\omega \\, \\hat{e}_r",
        "\\dot{\\hat{e}}_\\theta  =  \\vec{\\omega} \\times \\hat{e}_\\theta",
        "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_z \\times \\hat{e}_\\theta",
        "\\dot{\\hat{e}}_\\theta  =  \\omega \\, \\hat{e}_z \\times \\hat{e}_\\theta",
        "\\hat{e}_r             = -\\frac{1}{\\dot{\\theta}} \\, \\dot{\\hat{e}}_\\theta",
        "\\hat{e}_r             = -\\frac{1}{\\omega} \\, \\dot{\\hat{e}}_\\theta",
    ]

    false_list = [
        "\\hat{e}_\\theta        = -\\dot{\\theta} \\, \\hat{e}_r",
        "\\hat{e}_\\theta        = -\\omega \\, \\hat{e}_r",
        "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_r",
        "\\dot{\\hat{e}}_\\theta  =  \\omega \\, \\hat{e}_r",
        "\\hat{e}_r             =  \\frac{1}{\\dot{\\theta}} \\, \\dot{\\hat{e}}_\\theta",
        "\\hat{e}_r             =  \\frac{1}{\\omega} \\, \\dot{\\hat{e}}_\\theta",
        "-\\dot{\\theta}         =  \\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
        "-\\omega               =  \\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
        "\\dot{\\theta}          = -\\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
        "\\omega                = -\\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
        "\\dot{\\hat{e}}_\\theta  = -\\dot{\\theta} \\, \\hat{e}_r + \\theta \\, \\dot{\\hat{e}}_r",
        "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_r - \\theta \\, \\dot{\\hat{e}}_r",
        "\\dot{\\hat{e}}_\\theta  =  -\\omega \\, \\hat{e}_z \\times \\hat{e}_\\theta",
    ]

    ans1 = "false"
    ans2 = "false"

    if case == True:
        expr = random.choice(true_list)
        ans1 = "true"
    else:
        expr = random.choice(false_list)
        ans2 = "true"

    data["params"]["expr"] = expr
    data["params"]["ans1"] = ans1
    data["params"]["ans2"] = ans2

    return data

# This should immediately cause the question to fail to generate.
import rpy2.robjects as robjects


def generate(data):
    data["params"]["random_number"] = robjects.r("sample(1:10, 1)")

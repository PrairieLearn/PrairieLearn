import random

def generate(data):
    polygon = '[{"x": 40, "y": 40}, {"x": 140,"y": 80}, {"x": 100,"y": 160}, {"x": 80,"y": 140}]'
    data["params"]["polygon"] = polygon

    return data

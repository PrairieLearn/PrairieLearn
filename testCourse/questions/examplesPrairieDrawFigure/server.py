import random
import math
import numpy as np


def generate(data):
    
    # The title parameter won't change from variant to variant
    data["params"]["title"] = "PrairieDraw Figure"
    
    # The parameters for the second figure are randomized
    dimension = random.randint(1,4)
    
    shapeNames = ["circle", "square", "rectangle"];
    random.shuffle(shapeNames)
    
    shape_c, shape_x1, shape_x2 = shapeNames
    
    data["params"]["shapeName"] = shape_c
    data["params"]["dimension"] = dimension
    
    data["params"]["shape_c"] = shape_c
    data["params"]["shape_x1"] = shape_x1
    data["params"]["shape_x2"] = shape_x2
        
    return data
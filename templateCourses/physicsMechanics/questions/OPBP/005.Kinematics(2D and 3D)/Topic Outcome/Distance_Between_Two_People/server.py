import random
import math
import pandas as pd
from collections import defaultdict
    
def generate(data):
    data2 = create_data2()
    
    # define or load names/items/objects from server files
    names = pd.read_csv("https://raw.githubusercontent.com/open-resources/problem_bank_helpers/main/data/names.csv")["Names"].tolist()
    
    # store phrases etc
    data2["params"]["vars"]["title"] = 'Distance Between Two People'
    data2["params"]["vars"]["units"] = r"$\rm{m}$"
    
    # Randomize names
    name1 = random.choice(names)
    names.remove(name1)
    name2 = random.choice(names)
    
    # Store names
    data2["params"]["vars"]["name1"] = name1
    data2["params"]["vars"]["name2"] = name2
    
    # Randomize Variables
    s = random.randint(1,4)
    # Coefficients for first equation
    ai_1 = random.randint(1,3)
    ai_2 = random.randint(2,4)
    ai_3 = random.randint(1,3)
    aj_1 = random.randint(1,4)
    aj_2 = random.randint(2,5)
    aj_3 = random.randint(1,3)
    # Coefficients for second equation
    bi_1 = random.randint(2,5)
    bi_2 = random.randint(1,4)
    bi_3 = random.randint(1,3)
    bj_1 = random.randint(3,6)
    bj_2 = random.randint(1,3)
    bj_3 = random.randint(1,3)
    
    # store the variables in the dictionary "params"
    data2["params"]["s"] = s
    data2["params"]["ai_1"] = ai_1
    data2["params"]["ai_2"] = ai_2
    data2["params"]["ai_3"] = ai_3
    data2["params"]["aj_1"] = aj_1
    data2["params"]["aj_2"] = aj_2
    data2["params"]["aj_3"] = aj_3
    
    data2["params"]["bi_1"] = bi_1
    data2["params"]["bi_2"] = bi_2
    data2["params"]["bi_3"] = bi_3
    data2["params"]["bj_1"] = bj_1
    data2["params"]["bj_2"] = bj_2
    data2["params"]["bj_3"] = bj_3
    
    
    # define possible answers
    ra_i = ai_1 + ai_2*s - ai_3*s**2
    ra_j = aj_1 + aj_2*s - aj_3*s**2
    
    
    rb_i = bi_1 + bi_2*s - bi_3*s**2
    rb_j = bj_1 + bj_2*s + bj_3*s**2
    
    ans_i = rb_i - ra_i
    ans_j = rb_j - ra_j
    
    ans = math.sqrt(ans_i**2 + ans_j**2)
    
    wrong_ans_sum = abs(ans_i + ans_j)
    wrong_ans_diff = abs(ans_i - ans_j)
    
    data2["params"]["part1"]["ans1"]["value"] = round(ans, 2)
    data2["params"]["part1"]["ans1"]["correct"] = True
    
    if ans > 1:
    
        data2["params"]["part1"]["ans2"]["value"] = round(ans/2,  2)
        data2["params"]["part1"]["ans2"]["correct"] = False
    
        data2["params"]["part1"]["ans3"]["value"] = round(ans**2,  2)
        data2["params"]["part1"]["ans3"]["correct"] = False
    
        if ans_i == 0 or ans_j == 0:
            # otherwise would typically have ans4 = ans 5
    
            data2["params"]["part1"]["ans4"]["value"] = round(math.sqrt(ans**2 + 1), 2)
            data2["params"]["part1"]["ans4"]["correct"] = False
    
            data2["params"]["part1"]["ans5"]["value"] = 0
            data2["params"]["part1"]["ans5"]["correct"] = False
    
        else:
            data2["params"]["part1"]["ans4"]["value"] = round(wrong_ans_sum, 2)
            data2["params"]["part1"]["ans4"]["correct"] = False
    
            data2["params"]["part1"]["ans5"]["value"] = round(wrong_ans_diff,  2)
            data2["params"]["part1"]["ans5"]["correct"] = False
    
    else:
        # only two possible cases are ans = 0,1
    
        data2["params"]["part1"]["ans2"]["value"] = ~int(ans)
        data2["params"]["part1"]["ans2"]["correct"] = False
    
        data2["params"]["part1"]["ans3"]["value"] = 0.5
        data2["params"]["part1"]["ans3"]["correct"] = False
    
        data2["params"]["part1"]["ans4"]["value"] = round(math.sqrt(2), 2)
        data2["params"]["part1"]["ans4"]["correct"] = False
    
        data2["params"]["part1"]["ans5"]["value"] = 2
        data2["params"]["part1"]["ans5"]["correct"] = False
    
    # Update the data object with a new dict
    data.update(data2)

def create_data2():

    nested_dict = lambda: defaultdict(nested_dict)
    return nested_dict()
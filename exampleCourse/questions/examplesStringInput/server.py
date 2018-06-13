import random

def generate(data):

    a = random.randint(2,4)
    stringname = "love"

    b = 'hello '
    c = 'it is a beautiful day!'

    list1 = []
    for i in range(8):
        list1.append(random.randint(0, 1))

    d = ''.join(str(e) for e in list1)


    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["stringname"] = stringname

    data["correct_answers"]["ans1"] = a*stringname
    data["correct_answers"]["ans2"] = b+c
    data["correct_answers"]["ans3"] = d
    data["correct_answers"]["ans4"] = d
    data["correct_answers"]["ans5"] = "blank"

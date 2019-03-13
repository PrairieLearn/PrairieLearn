import random, math

def generate(data):

    # Simulate values
    a = random.randint(2, 10)
    b = random.randint(2, 10)
    c = random.randint(20,100)/100
    d = random.uniform(1,99)

    # Assemble Matrix
    x = [[a,b,a,b]]
    x1 = [[a,b],[a,b]]
    xC = [[c,a,c]]

    # Release parameters
    data["params"]["a"] = a
    data["params"]["b"] = b
    data["params"]["c"] = c
    data["params"]["d"] = d
    data["params"]["x"] = x
    data["params"]["x1"] = x1
    data["params"]["xC"] = xC

    # Release correct answer

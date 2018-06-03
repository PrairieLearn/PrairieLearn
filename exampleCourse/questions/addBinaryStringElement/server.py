import random

def generate(data):

    list1 = [1]
    list2 = [1]
    for i in range(6):
        list1.append(random.randint(0, 1))
        list2.append(random.randint(0, 1))

    str1 = ''.join(str(e) for e in list1)
    str2 = ''.join(str(e) for e in list2)

    c = bin(int(str1,2) + int(str2,2))[2:]

    data["params"]["a"] = str1
    data["params"]["b"] = str2

    data["correct_answers"]["c"] = c

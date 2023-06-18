import random


def generate(data):

    # Randomize iceberg and sea water density

    ice = round(random.uniform(0.91, 0.92), 4)  # g/cm^3
    sea = round(random.uniform(1.02, 1.03), 4)  # g/cm^3
    water = round(random.uniform(0.98, 1.00), 4)  # g/cm^3

    select = random.randint(0, 2)

    if select == 0:
        unknown = 100 - ice / sea * 100
        given1 = "the density of ice is " + str(ice) + " g/cm$^3$"
        given2 = "the density of sea water is " + str(sea) + " g/cm$^3$"
        question = 'determine the percentage of the iceberg by volume that will be the "tip" (above the ocean surface)'
        answer = "Percentage of iceberg above sea surface ="
        unit = "%"
    elif select == 1:
        unknown = 100 - ice / water * 100
        given1 = "the density of ice is " + str(ice) + " g/cm$^3$"
        given2 = "the density of fresh water is " + str(water) + " g/cm$^3$"
        question = 'determine the percentage of the iceberg by volume that will be the "tip" (above the surface) if it is in fresh water'
        answer = "Percentage of iceberg above fresh water surface ="
        unit = "%"
    else:
        unknown = sea
        given1 = "the density of ice is " + str(ice) + " g/cm$^3$"
        percent = round(100 - ice / sea * 100, 4)
        given2 = (
            str(percent)
            + '% of the iceberg by volume is the "tip" (above the ocean surface)'
        )
        question = "determine the corresponding density of sea water"
        answer = "Density of sea water ="
        unit = "g/cm$^3$"

    data["params"]["given1"] = given1
    data["params"]["given2"] = given2
    data["params"]["question"] = question
    data["params"]["answer"] = answer
    data["params"]["unit"] = unit
    data["correct_answers"]["unknown"] = unknown

    return data

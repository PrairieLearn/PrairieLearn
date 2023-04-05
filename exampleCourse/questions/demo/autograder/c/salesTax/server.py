import random


def generate(data):
    data["params"].update(
        {
            "state_tax": "%.2f" % (random.randint(20, 30) * 0.25),
            "county_tax": "%.2f" % (random.randint(4, 8) * 0.25),
            "city_tax": "%.2f" % (random.randint(4, 8) * 0.25),
        }
    )

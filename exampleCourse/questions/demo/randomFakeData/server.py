import datetime
import random

from faker import Faker


def formatDate(date):
    return date.strftime("%B %d, %Y")


def appendEmployee(data, fake, alias, birthdays):
    name = fake.name()
    birthday = formatDate(birthdays.pop(0))
    data["params"][alias] = name

    # Store in array to facilitate rendering list of employees in question.html template
    data["params"]["employees"].append({"name": name, "birthday": birthday})


def generate(data):
    fake = Faker()
    # Start with `set` to ensure uniqueness
    birthdays = set()

    year = 2000
    while len(birthdays) < 4:
        birthdays.add(
            fake.date_between(datetime.date(year, 1, 1), datetime.date(year, 12, 31))
        )

    # Once sorted, the first birthday belongs to the youngest employee
    birthdays = sorted(birthdays)

    data["params"]["employees"] = []
    appendEmployee(data, fake, "youngest", birthdays)
    appendEmployee(data, fake, "employee1", birthdays)
    appendEmployee(data, fake, "employee2", birthdays)
    appendEmployee(data, fake, "employee3", birthdays)
    random.shuffle(data["params"]["employees"])
    data["params"]["company"] = fake.company()

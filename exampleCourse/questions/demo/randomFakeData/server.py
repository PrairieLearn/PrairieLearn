import datetime
import random

from faker import Faker


def generate(data):
    fake = Faker()

    # Once sorted, the first birthday belongs to the youngest employee
    start = datetime.date(2000, 1, 1)
    end = datetime.date(2000, 12, 31)
    birthdays = sorted(fake.unique.date_between(start, end) for _ in range(4))

    employees = []

    for alias, birthday in zip(
        ["youngest", "employee1", "employee2", "employee3"], birthdays
    ):
        name = fake.unique.name()
        data["params"][alias] = name
        # Store in array to facilitate rendering list of employees in question.html template
        employees.append({"name": name, "birthday": birthday.strftime("%B %d, %Y")})

    random.shuffle(employees)

    data["params"]["employees"] = employees
    data["params"]["company"] = fake.company()

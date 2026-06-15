import prairielearn as pl


def parse(data):
    code = f"""
def last_element(lst: list):
    return lst[{data["submitted_answers"]["index"]}]
    """.strip()
    pl.add_submitted_file(data, "user_code.py", raw_contents=code)

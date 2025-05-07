import prairielearn as pl


def generate(data: pl.QuestionData):
    ureg = pl.get_unit_registry()
    answer = 5280 * ureg.foot

    data["correct_answers"]["c_6"] = str(answer)

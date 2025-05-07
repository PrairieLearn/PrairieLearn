import prairielearn as pl


def generate(data: pl.QuestionData):
    data["params"]["inner-text"] = (
        'This is some inner text taken from <code>data["params"]</code>.'
    )

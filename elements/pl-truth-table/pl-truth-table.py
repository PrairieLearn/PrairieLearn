import random

import chevron
import lxml.html
import lxml.etree
import prairielearn as pl

from typing import List, Tuple, NamedTuple, Dict
from typing_extensions import assert_never
from itertools import product, count

class AnswerCol(NamedTuple):
    text: str
    expression: str

WEIGHT_DEFAULT = 1
FIXED_VARIABLES_ORDER_DEFAULT = False
TRUE_LABEL_DEFAULT = "1"
FALSE_LABEL_DEFAULT = "0"
PARTIAL_CREDIT_DEFAULT = True
HIDE_ANSWER_PANEL_DEFAULT = False
HIDE_SCORE_BADGE_DEFAULT = False
BLANK_DEFAULT = True

def get_form_name(answers_name: str, index: int) -> str:
    return f"{answers_name}-dropdown-{index}"

def get_question_information(element: lxml.html.HtmlElement) -> Tuple[List[str], List[str], List[AnswerCol]]:
    variable_names = []
    rows = []
    cols = []

    for child in element:
        if child.tag == "pl-variable":
            pl.check_attribs(child, [], [])
            variable_names.append(pl.inner_html(child))

        elif child.tag == "pl-row":
            pl.check_attribs(child, [], [])
            rows.append(pl.inner_html(child))

        elif child.tag == "pl-answer-column":
            pl.check_attribs(child, [], ["expression"])
            expression = pl.get_string_attrib(child, "expression", None)
            if expression is None:
                expression = lxml.html.document_fromstring(
                        pl.inner_html(child)
                    ).text_content()


            cols.append(AnswerCol(pl.inner_html(child), expression))

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(f"Tags inside of pl-truth-table must be one of pl-variable, pl-row, or pl-answer-column, not '{child.tag}'.")

    return variable_names, rows, cols


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ["answers-name"]
    optional_attribs = ["fixed-order", "true-label", "false-label", "num-rows"]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")

    variable_names, custom_rows, answer_columns = get_question_information(element)

    expressions = [
        answer_col.expression
        for answer_col in answer_columns
    ]

    num_vars = len(variable_names)

    fixed_order = pl.get_boolean_attrib(
        element, "fixed-order", FIXED_VARIABLES_ORDER_DEFAULT
    )
    num_rows = pl.get_integer_attrib(element, "num-rows", None)

    if len(custom_rows) > 0:
        random.shuffle(custom_rows)
        fixed_order = True
    if not fixed_order:
        random.shuffle(variable_names)

    display_variables = [
        {"key": str(i), "html": variable}
        for i, variable in enumerate(variable_names)
    ]

    display_ans_columns = [
        {
            "key": str(i),
            "html": ans_column.text,
            "expression": ans_column.expression,
        }
        for i, ans_column in enumerate(answer_columns)
    ]

    display_rows = []
    correct_answers = []

    #TODO redo logic involving custom rows
    all_rows = True
    row_counter = count(0)

    if all_rows:
        for value_assignment in product([True, False], repeat=num_vars):
            var_vals = dict(zip(variable_names, value_assignment))

            display_rows.append({
                "key": str(next(row_counter)),
                "values": list(map(str, value_assignment))
            })

            for expr in expressions:
                #TODO get rid of this eval call!!!
                # Explanation: This eval call is similar to that made in the symbolic input question,
                # there's an open refactor of the backend of that element, so this is going to need to wait
                # until that is in until refactoring here and merging
                val = eval(expr, var_vals)
                correct_answers.append(str(val))


    '''
    if num_rows is not None and (len(custom_rows) > num_rows or default_num_rows > num_rows):
        if len(custom_rows) > 0:
            custom_rows = random.sample(custom_rows, num_rows)

            for i in range(num_rows):
                keyed_row = {"key": str(i)}

                row_info = custom_rows[i].split()
                values = []

                for j in range(len(row_info)):
                    values.append(int(row_info[j]))
                    var_vals[display_variables[j]["html"]] = int(row_info[j])

                keyed_row["values"] = values
                display_rows.append(keyed_row)
                for j in range(len(answer_columns)):
                    correct_answers.append(str(bool(eval(expressions[j]))))
        else:
            used_indices = []

            while len(used_indices) < num_rows:
                rand_index = random.randint(0, default_num_rows - 1)

                if rand_index not in used_indices:
                    used_indices.append(rand_index)

            for i in range(default_num_rows):
                if i in used_indices:
                    keyed_row = {
                        "key": str(i),
                    }
                    values = []

                    for j in range(num_vars):
                        power = pow(2, num_vars - j - 1)
                        val = 0

                        if (i // power) % 2 != 0:
                            val = 1

                        values.append(val)
                        var_vals[display_variables[j]["html"]] = val

                    keyed_row["values"] = values
                    display_rows.append(keyed_row)
                    for j in range(len(answer_columns)):
                        correct_answers.append(str(bool(eval(expressions[j]))))
    elif len(custom_rows) == 0:
        num_rows = default_num_rows

        for i in range(num_rows):
            keyed_row = {
                "key": str(i),
            }
            values = []

            for j in range(num_vars):
                power = pow(2, num_vars - j - 1)
                val = 0

                if (i // power) % 2 != 0:
                    val = 1

                values.append(val)
                var_vals[display_variables[j]["html"]] = val

            keyed_row["values"] = values
            display_rows.append(keyed_row)
            for j in range(len(answer_columns)):
                correct_answers.append(str(bool(eval(expressions[j]))))
    else:
        num_rows = len(custom_rows)

        for i in range(num_rows):
            keyed_row = {"key": str(i)}

            row_info = custom_rows[i].split()
            values = []
            val = 0

            for j in range(len(row_info)):
                values.append(int(row_info[j]))
                var_vals[display_variables[j]["html"]] = int(row_info[j])

            keyed_row["values"] = values
            display_rows.append(keyed_row)
            for j in range(len(answer_columns)):
                correct_answers.append(str(bool(eval(expressions[j]))))
    '''

    data["params"][name] = {
        "display_variables": display_variables,
        "display_rows": display_rows,
        "display_ans_columns": display_ans_columns
    }
    data["correct_answers"][name] = correct_answers


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    display_rows = data["params"][name]["display_rows"]
    display_ans_columns = data["params"][name]["display_ans_columns"]

    expected_num_answers = len(display_rows) * len(display_ans_columns)

    submitted_answers = data["submitted_answers"].get(name, [])

    if expected_num_answers != len(submitted_answers):
        data["format_errors"][name] = "Number of submitted answers doesn't match number of rows."
        return

    for i in range(expected_num_answers):
        student_answer = submitted_answers[i]

        if student_answer is None:
            data["format_errors"][get_form_name(name, i)] = "No answer was submitted."


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")


    display_variables = data["params"][name]["display_variables"]
    display_rows = data["params"][name]["display_rows"]
    display_ans_columns = data["params"][name]["display_ans_columns"]

    correct_answers = data["correct_answers"].get(name, [])
    num_ans_columns = len(display_ans_columns)

    submitted_answers = data["submitted_answers"].get(name, [])

    # TODO I think these lines can be deleted???
    #if submitted_answers == "True" or submitted_answers == "False":
    #    submitted_answers = [submitted_answers]

    hide_score_badge = pl.get_boolean_attrib(
        element, "hide-score-badge", HIDE_SCORE_BADGE_DEFAULT
    )
    true_label = pl.get_string_attrib(element, "true-label", TRUE_LABEL_DEFAULT)
    false_label = pl.get_string_attrib(element, "false-label", FALSE_LABEL_DEFAULT)
    #TODO start dropdowns as blank??
    blank_start = pl.get_boolean_attrib(element, "blank", BLANK_DEFAULT)
    show_answer_feedback = not hide_score_badge

    if data["panel"] == "question":
        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        display_score_badge = score is not None and show_answer_feedback

        variable_set = [
            {"html": variable["html"].strip(), "name": get_form_name(name, variable["key"])}
            for variable in display_variables
        ]

        ans_column_set = [
            {"html": ans_column["html"].strip()}
            for ans_column in display_ans_columns
        ]

        row_set = []

        for i, row in enumerate(display_rows):
            value_set = [
                {"html": true_label if val == "True" else false_label}
                for val in row["values"]
            ]

            ans_column_row_set = []

            for j, ans_column in enumerate(display_ans_columns):
                student_answer = None
                answer_index = (i * num_ans_columns) + j

                if display_score_badge:
                    student_answer = submitted_answers[answer_index]
                correct_answer = correct_answers[answer_index]

                ans_column_row_set.append({
                    "html": ans_column["html"].strip(),
                    "correct": display_score_badge and student_answer == correct_answer,
                    "submitted_true": student_answer == "True",
                    "submitted_false": student_answer == "False",
                })

            row_set.append({
                "key": row["key"],
                "values": value_set,
                "answer_columns": ans_column_row_set,
                "display_score_badge": display_score_badge,
            })

        html_params = {
            "question": True,
            "name": name,
            "uuid": pl.get_uuid(),
            "inputs": variable_set,
            "answer_columns": ans_column_set,
            "rows": row_set,
            "true_label": true_label,
            "false_label": false_label,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open("pl-truth-table.mustache", "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        global_format_error = data["format_errors"].get(name, None)
        if global_format_error is not None:
            html_params = {
                "submission": True,
                "parse_error": global_format_error,
            }

            with open("pl-truth-table.mustache", "r", encoding="utf-8") as f:
                return chevron.render(f, html_params).strip()

        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        display_score_badge = score is not None and show_answer_feedback

        variable_set = [
            {"html": variable["html"].strip()}
            for variable in display_variables
        ]

        ans_column_set = [
            {"html": ans_column["html"].strip()}
            for ans_column in display_ans_columns
        ]

        row_set = []

        for i, row in enumerate(display_rows):
            value_set = [
                {"html": true_label if val == "True" else false_label}
                for val in row["values"]
            ]

            student_answer_set = []

            for j in range(num_ans_columns):
                answer_index = (i * num_ans_columns) + j

                format_error = data["format_errors"].get(get_form_name(name, answer_index))

                if format_error is not None:
                    student_answer_set.append({
                        "parse_error": format_error
                    })

                    continue


                student_answer = submitted_answers[answer_index]
                correct_answer = correct_answers[answer_index]

                student_answer_set.append({
                    "html": true_label if student_answer == "True" else false_label,
                    "correct_answer": correct_answer,
                    "correct": display_score_badge and student_answer == correct_answer,
                })

            row_set.append({
                "key": row["key"],
                "values": value_set,
                "student_answers": student_answer_set,
                "display_score_badge": display_score_badge,
            })

        html_params = {
            "submission": True,
            "uuid": pl.get_uuid(),
            "inputs": variable_set,
            "answer_columns": ans_column_set,
            "rows": row_set,
            "display_score_badge": score is not None,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open("pl-truth-table.mustache", "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        if pl.get_boolean_attrib(element, "hide-answer-panel", HIDE_ANSWER_PANEL_DEFAULT):
            return ""

        variable_set = [
            {"html": variable["html"]}
            for variable in display_variables
        ]

        ans_column_set = [
            {"html": ans_column["html"].strip()}
            for ans_column in display_ans_columns
        ]

        row_set = []

        for i, row in enumerate(display_rows):
            correct_answer = correct_answers[i]

            value_set = [
                {"html": true_label if val == "True" else false_label}
                for val in row["values"]
            ]

            correct_answer_set = []

            for j in range(num_ans_columns):
                correct_answer = correct_answers[(i * num_ans_columns) + j]

                correct_answer_set.append({
                    "html": true_label if correct_answer == "True" else false_label
                })

            row_set.append({
                "key": row["key"],
                "values": value_set,
                "correct_answers": correct_answer_set,
            })

        html_params = {
            "answer": True,
            "uuid": pl.get_uuid(),
            "inputs": variable_set,
            "answer_columns": ans_column_set,
            "rows": row_set,
        }

        with open("pl-truth-table.mustache", "r", encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", PARTIAL_CREDIT_DEFAULT
    )

    correct_answers = data["correct_answers"].get(name, [])

    def edc_grade_fn(submitted_answers: List[str]) -> Tuple[float, None]:
        num_correct = sum(
            1 if submitted_answer == correct_answer else 0
            for (submitted_answer, correct_answer) in zip(submitted_answers, correct_answers)
        )

        return num_correct / len(correct_answers), None

    def no_partial_credit_grade_fn(submitted_answers: List[str]) -> Tuple[bool, None]:
        for (submitted_answer, correct_answer) in zip(submitted_answers, correct_answers):
            if submitted_answer != correct_answer:
                return False, None

        return True, None

    # TODO maybe simplify parts of this grading framework as part of merging this in??
    pl.grade_question_parameterized(
        data,
        name,
        grade_function=edc_grade_fn if partial_credit else no_partial_credit_grade_fn,
        weight=weight,
    )


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    correct_answers = data["correct_answers"][name]

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = correct_answers
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    elif result == "incorrect":
        incorrect_answers = [
            "False" if correct_answer == "True" else "True"
            for correct_answer in correct_answers
        ]
        data["raw_submitted_answers"][name] = incorrect_answers
        data["partial_scores"][name] = {"score": 0, "weight": weight}
    elif result == "invalid":

        test_case = random.randint(1, 2)
        data["partial_scores"][name] = {"score": 0, "weight": weight}

        if test_case == 1:
            #TODO this is a global parse error, add a test case with a local one
            data["raw_submitted_answers"][name] = correct_answers + [None]
            data["format_errors"][name] = "Number of submitted answers doesn't match number of rows."

        elif test_case == 2:
            # First, choose a random submission to change to None
            random_index = random.randint(0, len(correct_answers)-1)
            submitted_answers = correct_answers.copy()
            submitted_answers[random_index] = None

            data["raw_submitted_answers"][name] = submitted_answers

            # Then check that this gives the desired parse error in only one index
            data["format_errors"][get_form_name(name, random_index)] = "No answer was submitted."

        else:
            # TODO change this later to assert never
            raise ValueError

    else:
        assert_never(result)

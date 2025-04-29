import itertools as it
import json
import pathlib
import random
from collections import Counter
from enum import Enum
from typing import NamedTuple

import chevron
import lxml.etree
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"
    DROPDOWN = "dropdown"


class AotaNotaType(Enum):
    FALSE = 1
    RANDOM = 2
    INCORRECT = 3
    CORRECT = 4


class OrderType(Enum):
    RANDOM = "random"
    ASCEND = "ascend"
    DESCEND = "descend"
    FIXED = "fixed"


class AnswerTuple(NamedTuple):
    idx: int
    correct: bool
    html: str
    feedback: str | None
    score: float


SCORE_INCORRECT_DEFAULT = 0.0
SCORE_CORRECT_DEFAULT = 1.0
WEIGHT_DEFAULT = 1
FIXED_ORDER_DEFAULT = False
INLINE_DEFAULT = False
NONE_OF_THE_ABOVE_DEFAULT = AotaNotaType.FALSE
ALL_OF_THE_ABOVE_DEFAULT = AotaNotaType.FALSE
EXTERNAL_JSON_DEFAULT = None
HIDE_LETTER_KEYS_DEFAULT = False
EXTERNAL_JSON_CORRECT_KEY_DEFAULT = "correct"
EXTERNAL_JSON_INCORRECT_KEY_DEFAULT = "incorrect"
FEEDBACK_DEFAULT = None
HIDE_SCORE_BADGE_DEFAULT = False
ALLOW_BLANK_DEFAULT = False
SIZE_DEFAULT = None
PLACEHOLDER_DEFAULT = "Select an option"
SUBMITTED_ANSWER_BLANK = {"html": "No answer submitted"}

MULTIPLE_CHOICE_MUSTACHE_TEMPLATE_NAME = "pl-multiple-choice.mustache"


def categorize_options(
    element: lxml.html.HtmlElement, data: pl.QuestionData
) -> tuple[list[AnswerTuple], list[AnswerTuple]]:
    """Get provided correct and incorrect answers"""
    correct_answers = []
    incorrect_answers = []
    index_counter = it.count(0)

    # First, check internal HTML for answer choices
    for child in element:
        if child.tag in {"pl-answer", "pl_answer"}:
            pl.check_attribs(
                child,
                required_attribs=[],
                optional_attribs=["score", "correct", "feedback"],
            )
            correct = pl.get_boolean_attrib(child, "correct", False)
            child_html = pl.inner_html(child)
            child_feedback = pl.get_string_attrib(child, "feedback", FEEDBACK_DEFAULT)

            default_score = (
                SCORE_CORRECT_DEFAULT if correct else SCORE_INCORRECT_DEFAULT
            )
            score = pl.get_float_attrib(child, "score", default_score)

            if not (SCORE_INCORRECT_DEFAULT <= score <= SCORE_CORRECT_DEFAULT):
                raise ValueError(
                    f"Score {score} is invalid, must be in the range [0.0, 1.0]."
                )

            if correct and score != SCORE_CORRECT_DEFAULT:
                raise ValueError("Correct answers must give full credit.")

            answer_tuple = AnswerTuple(
                next(index_counter), correct, child_html, child_feedback, score
            )
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)

        elif isinstance(child, lxml.etree._Comment):
            continue

        else:
            raise ValueError(
                f"Tags inside of pl-multiple-choice must be pl-answer, not '{child.tag}'."
            )

    # NOTE Reading in answer choices from JSON is deprecated.
    file_path = pl.get_string_attrib(element, "external-json", EXTERNAL_JSON_DEFAULT)
    if file_path is not None:
        correct_attrib = pl.get_string_attrib(
            element, "external-json-correct-key", EXTERNAL_JSON_CORRECT_KEY_DEFAULT
        )
        incorrect_attrib = pl.get_string_attrib(
            element, "external-json-incorrect-key", EXTERNAL_JSON_INCORRECT_KEY_DEFAULT
        )

        if pathlib.PurePath(file_path).is_absolute():
            json_file = file_path
        else:
            json_file = pathlib.PurePath(data["options"]["question_path"]).joinpath(
                file_path
            )

        with open(json_file, encoding="utf-8") as f:
            obj = json.load(f)

        for text in obj.get(correct_attrib, []):
            correct_answers.append(  # noqa: PERF401
                AnswerTuple(
                    next(index_counter),
                    correct=True,
                    html=text,
                    feedback=None,
                    score=SCORE_CORRECT_DEFAULT,
                )
            )

        for text in obj.get(incorrect_attrib, []):
            incorrect_answers.append(  # noqa: PERF401
                AnswerTuple(
                    next(index_counter),
                    correct=False,
                    html=text,
                    feedback=None,
                    score=SCORE_INCORRECT_DEFAULT,
                )
            )

    return correct_answers, incorrect_answers


def get_nota_aota_attrib(
    element: lxml.html.HtmlElement, name: str, default: AotaNotaType
) -> AotaNotaType:
    """
    NOTA and AOTA used to be boolean values, but are changed to
    special strings. To ensure backwards compatibility, values
    interpreted as true or false are assumed to be older
    interpretations. If the value cannot be interpreted as boolean,
    the string representation is used.
    """
    try:
        boolean_value = pl.get_boolean_attrib(
            element, name, default != AotaNotaType.FALSE
        )
        return AotaNotaType.RANDOM if boolean_value else AotaNotaType.FALSE
    except Exception:
        return pl.get_enum_attrib(element, name, AotaNotaType, default)


def get_order_type(element: lxml.html.HtmlElement) -> OrderType:
    """Get order type in a backwards-compatible way. New display overwrites old."""
    if pl.has_attrib(element, "fixed-order") and pl.has_attrib(element, "order"):
        raise ValueError(
            'Setting answer choice order should be done with the "order" attribute.'
        )

    fixed_order = pl.get_boolean_attrib(element, "fixed-order", FIXED_ORDER_DEFAULT)
    order_type_default = OrderType.FIXED if fixed_order else OrderType.RANDOM

    return pl.get_enum_attrib(element, "order", OrderType, order_type_default)


def get_display_type(element: lxml.html.HtmlElement) -> DisplayType:
    """Get display type in a backwards-compatible way. New display overwrites old."""
    if pl.has_attrib(element, "inline") and pl.has_attrib(element, "display"):
        raise ValueError(
            'Setting answer choice display should be done with the "display" attribute.'
        )

    inline = pl.get_boolean_attrib(element, "inline", INLINE_DEFAULT)
    display_default = DisplayType.INLINE if inline else DisplayType.BLOCK

    return pl.get_enum_attrib(element, "display", DisplayType, display_default)


def prepare_answers_to_display(
    correct_answers: list[AnswerTuple],
    incorrect_answers: list[AnswerTuple],
    *,
    number_answers: int | None,
    aota: AotaNotaType,
    nota: AotaNotaType,
    aota_feedback: str | None,
    nota_feedback: str | None,
    order_type: OrderType,
    display_type: DisplayType,
) -> list[AnswerTuple]:
    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    if aota in {AotaNotaType.CORRECT, AotaNotaType.RANDOM} and len_correct < 2:
        # To prevent confusion on the client side
        raise ValueError(
            'pl-multiple-choice element must have at least 2 correct answers when all-of-the-above is set to "correct" or "random"'
        )

    if nota in {AotaNotaType.INCORRECT, AotaNotaType.FALSE} and len_correct < 1:
        # There must be a correct answer
        raise ValueError(
            'pl-multiple-choice element must have at least 1 correct answer, or add none-of-the-above set to "correct" or "random"'
        )

    if len_correct == 0:
        # If no correct option is provided, 'None of the above' will always
        # be correct, and 'All of the above' always incorrect
        if nota is AotaNotaType.RANDOM:
            nota = AotaNotaType.CORRECT

        if aota is AotaNotaType.RANDOM:
            aota = AotaNotaType.INCORRECT

    if len_incorrect == 0:
        # 'All of the above' will always be correct when no incorrect option is
        # provided, while still never both True
        if aota is AotaNotaType.RANDOM:
            aota = AotaNotaType.CORRECT

        if nota is AotaNotaType.RANDOM:
            nota = AotaNotaType.INCORRECT

    # 1. Pick the choice(s) to display
    # determine if user provides number-answers
    if number_answers is None:
        set_num_answers = False
        number_answers = len_total
    else:
        set_num_answers = True
        # figure out how many choice(s) to choose from the *provided* choices,
        # excluding 'none-of-the-above' and 'all-of-the-above'
        number_answers -= (1 if nota is not AotaNotaType.FALSE else 0) + (
            1 if aota is not AotaNotaType.FALSE else 0
        )

    expected_num_answers = number_answers

    if aota in {AotaNotaType.CORRECT, AotaNotaType.RANDOM}:
        # min number if 'All of the above' is correct
        number_answers = min(len_correct, number_answers)
        # raise exception when the *provided* number-answers can't be satisfied
        if set_num_answers and number_answers < expected_num_answers:
            raise ValueError(
                f"Not enough correct choices for all-of-the-above. Need {expected_num_answers - number_answers} more"
            )
    if nota in {AotaNotaType.CORRECT, AotaNotaType.RANDOM}:
        # if nota correct
        number_answers = min(len_incorrect, number_answers)
        # raise exception when the *provided* number-answers can't be satisfied
        if set_num_answers and number_answers < expected_num_answers:
            raise ValueError(
                f"Not enough incorrect choices for none-of-the-above. Need {expected_num_answers - number_answers} more"
            )
    # this is the case for
    # - 'All of the above' is incorrect
    # - 'None of the above' is incorrect
    # - nota and aota disabled
    number_answers = min(min(1, len_correct) + len_incorrect, number_answers)

    if nota is AotaNotaType.RANDOM or aota is AotaNotaType.RANDOM:
        # Either 'None of the above' or 'All of the above' is correct
        # with probability 1/(number_correct + nota + aota).
        prob_space = (
            len_correct
            + (1 if nota is AotaNotaType.RANDOM else 0)
            + (1 if aota is AotaNotaType.RANDOM else 0)
        )
        rand_int = random.randint(1, prob_space)
        if nota is AotaNotaType.RANDOM:
            nota = AotaNotaType.CORRECT if rand_int == 1 else AotaNotaType.INCORRECT
        if aota is AotaNotaType.RANDOM:
            aota = AotaNotaType.CORRECT if rand_int == 2 else AotaNotaType.INCORRECT

    if aota is AotaNotaType.CORRECT:
        # when 'All of the above' is correct, we choose all from correct
        # and none from incorrect
        number_correct = number_answers
        number_incorrect = 0
    elif nota is AotaNotaType.CORRECT:
        # when 'None of the above' is correct, we choose all from incorrect
        # and none from correct
        number_correct = 0
        number_incorrect = number_answers
    else:
        # PROOF: by the above probability, if len_correct == 0, then nota_correct
        # conversely; if not nota_correct, then len_correct != 0. Since len_correct
        # is none negative, this means len_correct >= 1.
        number_correct = 1
        number_incorrect = max(0, number_answers - number_correct)

    if not (0 <= number_incorrect <= len_incorrect):
        raise ValueError(
            f"INTERNAL ERROR: number_incorrect: ({number_incorrect}, {len_incorrect}, {number_answers})"
        )

    # 2. Sample correct and incorrect choices
    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect

    # 3. Sort sampled choices based on user preference.
    if order_type is OrderType.FIXED:
        sampled_answers.sort(key=lambda a: a.idx)
    elif order_type is OrderType.DESCEND:
        sampled_answers.sort(key=lambda a: a.html, reverse=True)
    elif order_type is OrderType.ASCEND:
        sampled_answers.sort(key=lambda a: a.html, reverse=False)
    elif order_type is OrderType.RANDOM:
        random.shuffle(sampled_answers)
    else:
        assert_never(order_type)

    use_inline_display = display_type is DisplayType.INLINE

    # Add 'All of the above' option after shuffling
    if aota is not AotaNotaType.FALSE:
        aota_text = "All of these" if use_inline_display else "All of the above"
        aota_default_score = (
            SCORE_CORRECT_DEFAULT
            if aota is AotaNotaType.CORRECT
            else SCORE_INCORRECT_DEFAULT
        )
        sampled_answers.append(
            AnswerTuple(
                len_total,
                aota is AotaNotaType.CORRECT,
                aota_text,
                aota_feedback,
                aota_default_score,
            )
        )

    # Add 'None of the above' option after shuffling
    if nota is not AotaNotaType.FALSE:
        nota_text = "None of these" if use_inline_display else "None of the above"
        nota_default_score = (
            SCORE_CORRECT_DEFAULT
            if nota is AotaNotaType.CORRECT
            else SCORE_INCORRECT_DEFAULT
        )
        sampled_answers.append(
            AnswerTuple(
                len_total + 1,
                nota is AotaNotaType.CORRECT,
                nota_text,
                nota_feedback,
                nota_default_score,
            )
        )

    return sampled_answers


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "number-answers",
        "fixed-order",
        "inline",
        "hide-letter-keys",
        "none-of-the-above",
        "none-of-the-above-feedback",
        "all-of-the-above",
        "all-of-the-above-feedback",
        "external-json",
        "external-json-correct-key",
        "external-json-incorrect-key",
        "order",
        "display",
        "hide-score-badge",
        "allow-blank",
        "size",
        "placeholder",
        "label",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    # Before going to the trouble of preparing answers list, check for name duplication
    name = pl.get_string_attrib(element, "answers-name")

    if get_display_type(element) is not DisplayType.DROPDOWN:
        if pl.has_attrib(element, "size"):
            raise ValueError(
                f'"size" attribute on "{name}" should only be set if display is "dropdown".'
            )
        if pl.has_attrib(element, "placeholder"):
            raise ValueError(
                f'"placeholder" attribute on "{name}" should only be set if display is "dropdown".'
            )

    if name in data["params"]:
        raise ValueError(f"Duplicate params variable name: {name}")
    if name in data["correct_answers"]:
        raise ValueError(f"Duplicate correct_answers variable name: {name}")

    correct_answers, incorrect_answers = categorize_options(element, data)

    # Check for duplicate answers. Ignore trailing/leading whitespace
    # Making a conscious choice *NOT* to apply .lower() to all list elements in case
    # instructors want to explicitly have matrix M vs. vector m as possible options.

    choices_dict = Counter(
        choice.html.strip() for choice in it.chain(correct_answers, incorrect_answers)
    )

    duplicates = [item for item, count in choices_dict.items() if count > 1]

    if duplicates:
        raise ValueError(
            f"pl-multiple-choice element has duplicate choices: {duplicates}"
        )

    # Get answers to display to student, using a helper function to separate out logic.
    answers_to_display = prepare_answers_to_display(
        correct_answers,
        incorrect_answers,
        number_answers=pl.get_integer_attrib(element, "number-answers", None),
        aota=get_nota_aota_attrib(
            element, "all-of-the-above", ALL_OF_THE_ABOVE_DEFAULT
        ),
        nota=get_nota_aota_attrib(
            element, "none-of-the-above", NONE_OF_THE_ABOVE_DEFAULT
        ),
        aota_feedback=pl.get_string_attrib(
            element, "all-of-the-above-feedback", FEEDBACK_DEFAULT
        ),
        nota_feedback=pl.get_string_attrib(
            element, "none-of-the-above-feedback", FEEDBACK_DEFAULT
        ),
        order_type=get_order_type(element),
        display_type=get_display_type(element),
    )

    # Write to data. Because 'All of the above' is below all the correct choice(s) when it's
    # true, the variable correct_answer will save it as correct, and overwriting previous choice(s).
    # NOTE: The saved correct answer is just the one that gets shown to the student, it is not used for grading
    display_answers = []
    correct_answer = None
    for key, answer in zip(pl.iter_keys(), answers_to_display, strict=False):
        keyed_answer = {
            "key": key,
            "html": answer.html,
            "feedback": answer.feedback,
            "score": answer.score,
        }
        display_answers.append(keyed_answer)
        if answer.correct:
            correct_answer = keyed_answer

    data["params"][name] = display_answers
    data["correct_answers"][name] = correct_answer


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    hide_score_badge = pl.get_boolean_attrib(
        element, "hide-score-badge", HIDE_SCORE_BADGE_DEFAULT
    )

    answers = data["params"].get(name, [])
    display_type = get_display_type(element)

    inline = display_type is not DisplayType.BLOCK
    display_radio = display_type in {DisplayType.BLOCK, DisplayType.INLINE}
    submitted_key = data["submitted_answers"].get(name, None)
    aria_label = pl.get_string_attrib(element, "label", "Multiple choice options")

    if data["panel"] == "question":
        editable = data["editable"]
        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        display_score = score is not None
        feedback = partial_score.get("feedback", None)

        # Set up the templating for each answer
        answerset = []
        for answer in answers:
            is_submitted_answer = submitted_key == answer["key"]
            should_display_badge = is_submitted_answer and not hide_score_badge

            answer_html = {
                "key": answer["key"],
                "selected": is_submitted_answer,
                "html": answer["html"],
                "display_score_badge": should_display_badge and display_score,
                "display_feedback": is_submitted_answer and feedback,
                "feedback": feedback,
            }

            if should_display_badge and display_score:
                score_type, _ = pl.determine_score_params(score)
                answer_html[score_type] = True

            answerset.append(answer_html)

        size = SIZE_DEFAULT
        if pl.has_attrib(element, "size"):
            # Convert from character width to pixels for consistency with other elements
            # https://www.unitconverters.net/typography/character-x-to-pixel-x.htm
            size = pl.get_integer_attrib(element, "size") * 8

        placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)

        html_params = {
            "question": True,
            "inline": inline,
            "feedback": feedback,
            "radio": display_radio,
            "size": size,
            "placeholder": placeholder,
            "uuid": pl.get_uuid(),
            "name": name,
            "editable": editable,
            "display_score_badge": display_score,
            "answers": answerset,
            "aria_label": aria_label,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
        }

        # Display the score badge if necessary
        if not hide_score_badge and display_score:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open(MULTIPLE_CHOICE_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        hide_letter_keys = pl.get_boolean_attrib(
            element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
        )
        html_params = {
            "submission": True,
            "parse_error": parse_error,
            "inline": inline,
            "uuid": pl.get_uuid(),
            "hide_letter_keys": hide_letter_keys or submitted_key is None,
        }

        if parse_error is None:
            submitted_answer = next(
                filter(lambda a: a["key"] == submitted_key, answers),
                SUBMITTED_ANSWER_BLANK,
            )
            html_params["submitted_key"] = submitted_key
            html_params["submitted_answer"] = submitted_answer

            partial_score = data["partial_scores"].get(name, {"score": None})
            feedback = partial_score.get("feedback", None)
            score = partial_score.get("score", None)
            if score is not None:
                html_params["display_score_badge"] = True
                score_type, score_value = pl.determine_score_params(score)
                html_params[score_type] = score_value

            if feedback is not None:
                html_params["display_feedback"] = True
                html_params["feedback"] = feedback

        with open(MULTIPLE_CHOICE_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        correct_answer = data["correct_answers"].get(name, None)

        if correct_answer is None:
            raise ValueError("No true answer.")

        html_params = {
            "answer": True,
            "answers": correct_answer,
            "key": correct_answer["key"],
            "html": correct_answer["html"],
            "inline": inline,
            "radio": display_radio,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
        }
        with open(MULTIPLE_CHOICE_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    submitted_key = data["submitted_answers"].get(name, None)
    all_keys = {a["key"] for a in data["params"][name]}

    if not allow_blank and submitted_key is None:
        data["format_errors"][name] = "No answer was submitted."
        return

    if submitted_key not in all_keys and submitted_key is not None:
        data["format_errors"][name] = (
            f"Invalid choice: {pl.escape_invalid_string(submitted_key)}"
        )
        return


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    submitted_key = data["submitted_answers"].get(name, None)
    correct_key = data["correct_answers"].get(name, {"key": None}).get("key", None)
    default_score = (
        SCORE_CORRECT_DEFAULT
        if submitted_key == correct_key
        else SCORE_INCORRECT_DEFAULT
    )

    def grade_multiple_choice(submitted_key: str) -> tuple[float, str | None]:
        for option in data["params"][name]:
            if option["key"] == submitted_key:
                return option.get("score", default_score), option.get("feedback", "")

        return 0.0, "No correct answer."

    pl.grade_answer_parameterized(data, name, grade_multiple_choice, weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    correct_key = data["correct_answers"].get(name, {"key": None}).get("key", None)
    if correct_key is None:
        raise ValueError("could not determine correct_key")

    number_answers = len(data["params"][name])
    all_keys = list(it.islice(pl.iter_keys(), number_answers))
    incorrect_keys = list(set(all_keys) - {correct_key})

    result = data["test_type"]
    if result == "correct":
        data["raw_submitted_answers"][name] = data["correct_answers"][name]["key"]
        data["partial_scores"][name] = {"score": 1.0, "weight": weight}

        feedback = data["correct_answers"][name].get("feedback", None)
        if feedback is not None:
            data["partial_scores"][name]["feedback"] = feedback

    elif result == "incorrect":
        if len(incorrect_keys) > 0:
            random_key = random.choice(incorrect_keys)
            data["raw_submitted_answers"][name] = random_key

            score, feedback = next(
                (option.get("score", 0.0), option.get("feedback"))
                for option in data["params"][name]
                if option["key"] == random_key
            )

            data["partial_scores"][name] = {"score": score, "weight": weight}

            if feedback is not None:
                data["partial_scores"][name]["feedback"] = feedback

        else:
            # actually an invalid submission
            data["raw_submitted_answers"][name] = "0"
            data["format_errors"][name] = "INVALID choice"
    elif result == "invalid":
        data["raw_submitted_answers"][name] = "0"
        data["format_errors"][name] = "INVALID choice"

        # FIXME: add more invalid choices
    else:
        assert_never(result)

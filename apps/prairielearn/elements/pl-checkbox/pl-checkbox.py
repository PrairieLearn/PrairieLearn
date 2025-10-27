import random
from enum import Enum
from itertools import count
from typing import NamedTuple

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


# Internal enums for better code organization
class PartialCreditType(Enum):
    """Internal enum for partial credit grading modes.

    Note: This is an internal implementation detail. The external API still uses
    partial-credit="true|false" + partial-credit-method="PC|COV|EDC"
    """

    ALL_OR_NOTHING = "none"
    NET_CORRECT = "PC"
    EACH_ANSWER = "EDC"
    COVERAGE = "COV"


class OrderType(Enum):
    """Internal enum for answer ordering.

    Note: This is an internal implementation detail. The external API still uses
    fixed-order="true|false"
    """

    RANDOM = "random"
    FIXED = "fixed"


class AnswerTuple(NamedTuple):
    """Represents an answer option with its properties."""

    idx: int
    correct: bool
    html: str
    feedback: str | None


# Default values
WEIGHT_DEFAULT = 1
FIXED_ORDER_DEFAULT = False
INLINE_DEFAULT = False
PARTIAL_CREDIT_DEFAULT = False
PARTIAL_CREDIT_METHOD_DEFAULT = "PC"
HIDE_ANSWER_PANEL_DEFAULT = False
HIDE_HELP_TEXT_DEFAULT = False
DETAILED_HELP_TEXT_DEFAULT = False
HIDE_LETTER_KEYS_DEFAULT = False
HIDE_SCORE_BADGE_DEFAULT = False
SHOW_NUMBER_CORRECT_DEFAULT = False
MIN_CORRECT_DEFAULT = 1
MIN_SELECT_DEFAULT = 1
FEEDBACK_DEFAULT = None

CHECKBOX_MUSTACHE_TEMPLATE_NAME = "pl-checkbox.mustache"


def _get_partial_credit_type(
    partial_credit: bool, partial_credit_method: str
) -> PartialCreditType:
    """Convert external partial credit attributes to internal enum.

    Args:
        partial_credit: Boolean indicating if partial credit is enabled
        partial_credit_method: Method string ("PC", "COV", or "EDC")

    Returns:
        PartialCreditType enum value

    Raises:
        ValueError: If partial_credit_method is not one of "PC", "COV", or "EDC"
    """
    if not partial_credit:
        return PartialCreditType.ALL_OR_NOTHING

    if partial_credit_method == "PC":
        return PartialCreditType.NET_CORRECT
    elif partial_credit_method == "COV":
        return PartialCreditType.COVERAGE
    elif partial_credit_method == "EDC":
        return PartialCreditType.EACH_ANSWER
    else:
        raise ValueError(f"Unknown partial_credit_method: {partial_credit_method}")


def _get_order_type(fixed_order: bool) -> OrderType:
    """Convert external fixed-order attribute to internal enum.

    Args:
        fixed_order: Boolean indicating if answers should be in fixed order

    Returns:
        OrderType enum value
    """
    return OrderType.FIXED if fixed_order else OrderType.RANDOM


def generate_help_text(
    *,
    num_correct: int,
    num_display_answers: int,
    show_number_correct: bool,
    detailed_help_text: bool,
    has_min_select_attrib: bool,
    has_max_select_attrib: bool,
    min_options_to_select: int,
    max_options_to_select: int,
) -> str:
    """Generate help text for checkbox element.

    Args:
        num_correct: Number of correct answers
        num_display_answers: Total number of displayed answers
        show_number_correct: Whether to show the number of correct options
        detailed_help_text: Whether to show detailed help text
        has_min_select_attrib: Whether min-select attribute is specified
        has_max_select_attrib: Whether max-select attribute is specified
        min_options_to_select: Minimum options that must be selected
        max_options_to_select: Maximum options that can be selected

    Returns:
        HTML string for help text
    """
    # Generate number correct text if requested
    if show_number_correct:
        if num_correct == 1:
            number_correct_text = (
                " There is exactly <b>1</b> correct option in the list above."
            )
        else:
            number_correct_text = f" There are exactly <b>{num_correct}</b> correct options in the list above."
    else:
        number_correct_text = ""

    # Determine whether to show min/max select values
    show_min_select = (
        has_min_select_attrib and min_options_to_select != MIN_SELECT_DEFAULT
    )
    show_max_select = (
        has_max_select_attrib and max_options_to_select != num_display_answers
    )

    # Generate the selection requirement text
    if detailed_help_text or (show_min_select and show_max_select):
        # Show both min and max
        if min_options_to_select != max_options_to_select:
            insert_text = f" between <b>{min_options_to_select}</b> and <b>{max_options_to_select}</b> options."
        else:
            insert_text = f" exactly <b>{min_options_to_select}</b> options."
    elif show_min_select:
        insert_text = f" at least <b>{min_options_to_select}</b> options."
    elif show_max_select:
        insert_text = f" at most <b>{max_options_to_select}</b> options."
    else:
        # Default case - no specific requirements shown
        insert_text = " at least 1 option."

    insert_text += number_correct_text

    # Generate final help text
    if detailed_help_text or show_min_select or show_max_select:
        helptext = f'<small class="form-text text-muted">Select {insert_text}</small>'
    else:
        # Generic help text when no specific requirements are shown
        helptext = f'<small class="form-text text-muted">Select all possible options that apply.{number_correct_text}</small>'

    return helptext


def categorize_options(
    element: lxml.html.HtmlElement,
) -> tuple[list[AnswerTuple], list[AnswerTuple]]:
    """Get provided correct and incorrect answers.

    Args:
        element: The pl-checkbox HTML element

    Returns:
        Tuple of (correct_answers, incorrect_answers) as AnswerTuple lists
    """
    correct_answers = []
    incorrect_answers = []
    index = count(0)

    for child in element:
        if child.tag in ["pl-answer", "pl_answer"]:
            pl.check_attribs(
                child, required_attribs=[], optional_attribs=["correct", "feedback"]
            )
            correct = pl.get_boolean_attrib(child, "correct", False)
            child_html = pl.inner_html(child)
            child_feedback = pl.get_string_attrib(child, "feedback", FEEDBACK_DEFAULT)
            answer_tuple = AnswerTuple(next(index), correct, child_html, child_feedback)
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)

    return correct_answers, incorrect_answers


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "number-answers",
        "min-correct",
        "max-correct",
        "fixed-order",
        "inline",
        "hide-answer-panel",
        "hide-help-text",
        "detailed-help-text",
        "partial-credit",
        "partial-credit-method",
        "hide-letter-keys",
        "hide-score-badge",
        "min-select",
        "max-select",
        "show-number-correct",
    ]

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", PARTIAL_CREDIT_DEFAULT
    )
    partial_credit_method = pl.get_string_attrib(element, "partial-credit-method", None)
    if not partial_credit and partial_credit_method is not None:
        raise ValueError(
            "Cannot specify partial-credit-method if partial-credit is not enabled"
        )

    correct_answers, incorrect_answers = categorize_options(element)

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    if len_correct == 0:
        raise ValueError("At least one option must be true.")

    number_answers = pl.get_integer_attrib(element, "number-answers", len_total)
    min_correct = pl.get_integer_attrib(element, "min-correct", MIN_CORRECT_DEFAULT)
    max_correct = pl.get_integer_attrib(element, "max-correct", len(correct_answers))

    if min_correct < 1:
        raise ValueError(
            f"The attribute min-correct is {min_correct:d} but must be at least 1"
        )

    # FIXME: why enforce a maximum number of options?
    max_answers = 26  # will not display more than 26 checkbox answers

    number_answers = max(0, min(len_total, max_answers, number_answers))
    min_correct = min(
        len_correct, number_answers, max(0, number_answers - len_incorrect, min_correct)
    )
    max_correct = min(len_correct, number_answers, max(min_correct, max_correct))
    if not (0 <= min_correct <= max_correct <= len_correct):
        raise ValueError(
            f"INTERNAL ERROR: correct number: ({min_correct}, {max_correct}, {len_correct}, {len_incorrect})"
        )
    min_incorrect = number_answers - max_correct
    max_incorrect = number_answers - min_correct
    if not (0 <= min_incorrect <= max_incorrect <= len_incorrect):
        raise ValueError(
            f"INTERNAL ERROR: incorrect number: ({min_incorrect}, {max_incorrect}, {len_incorrect}, {len_correct})"
        )

    min_select = pl.get_integer_attrib(element, "min-select", MIN_SELECT_DEFAULT)
    max_select = pl.get_integer_attrib(element, "max-select", number_answers)

    if min_select < 1:
        raise ValueError(
            f"The attribute min-select is {min_select} but must be at least 1"
        )

    # Check that min_select, max_select, number_answers, min_correct, and max_correct all have sensible values relative to each other.
    if min_select > max_select:
        raise ValueError(
            f"min-select ({min_select}) is greater than max-select ({max_select})"
        )
    if min_select > number_answers:
        raise ValueError(
            f"min-select ({min_select}) is greater than the total number of answers to display ({number_answers})"
        )
    if min_select > min_correct:
        raise ValueError(
            f"min-select ({min_select}) is greater than the minimum possible number of correct answers ({min_correct})"
        )
    if max_select < max_correct:
        raise ValueError(
            f"max-select ({max_select}) is less than the maximum possible number of correct answers ({max_correct})"
        )

    number_correct = random.randint(min_correct, max_correct)
    number_incorrect = number_answers - number_correct

    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    # Use internal enum for order type
    fixed_order = pl.get_boolean_attrib(element, "fixed-order", FIXED_ORDER_DEFAULT)
    order_type = _get_order_type(fixed_order)

    if order_type is OrderType.FIXED:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a.idx)  # sort by stored original index
    elif order_type is OrderType.RANDOM:
        pass  # already shuffled
    else:
        assert_never(order_type)

    display_answers = []
    correct_answer_list = []
    for i, answer in enumerate(sampled_answers):
        keyed_answer = {
            "key": pl.index2key(i),
            "html": answer.html,
            "feedback": answer.feedback,
        }
        display_answers.append(keyed_answer)
        if answer.correct:
            correct_answer_list.append(keyed_answer)

    if name in data["params"]:
        raise ValueError(f"duplicate params variable name: {name}")
    if name in data["correct_answers"]:
        raise ValueError(f"duplicate correct_answers variable name: {name}")
    data["params"][name] = display_answers
    data["correct_answers"][name] = correct_answer_list


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", PARTIAL_CREDIT_DEFAULT
    )
    partial_credit_method = pl.get_string_attrib(
        element, "partial-credit-method", PARTIAL_CREDIT_METHOD_DEFAULT
    )
    hide_score_badge = pl.get_boolean_attrib(
        element, "hide-score-badge", HIDE_SCORE_BADGE_DEFAULT
    )

    editable = data["editable"]
    # answer feedback is not displayed when partial credit is True
    # (unless the question is disabled)
    show_answer_feedback = True
    if (partial_credit and editable) or hide_score_badge:
        show_answer_feedback = False

    display_answers = data["params"].get(name, [])
    inline = pl.get_boolean_attrib(element, "inline", INLINE_DEFAULT)
    submitted_keys = data["submitted_answers"].get(name, [])

    # if there is only one key then it is passed as a string,
    # not as a length-one list, so we fix that next
    if isinstance(submitted_keys, str):
        submitted_keys = [submitted_keys]

    correct_answer_list = data["correct_answers"].get(name, [])
    correct_keys = [answer["key"] for answer in correct_answer_list]

    if data["panel"] == "question":
        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        feedback = partial_score.get("feedback", None)

        answerset = []
        for answer in display_answers:
            answer_html = {
                "key": answer["key"],
                "checked": (answer["key"] in submitted_keys),
                "html": answer["html"].strip(),
                "display_score_badge": score is not None
                and show_answer_feedback
                and answer["key"] in submitted_keys,
                "display_feedback": answer["key"] in submitted_keys
                and feedback
                and feedback.get(answer["key"], None),
                "feedback": feedback.get(answer["key"], None) if feedback else None,
            }
            if answer_html["display_score_badge"]:
                answer_html["correct"] = answer["key"] in correct_keys
                answer_html["incorrect"] = answer["key"] not in correct_keys
            answerset.append(answer_html)

        info_params = {"format": True}
        # Adds decorative help text per bootstrap formatting guidelines:
        # http://getbootstrap.com/docs/4.0/components/forms/#help-text
        # Determine whether we should add a choice selection requirement
        hide_help_text = pl.get_boolean_attrib(
            element, "hide-help-text", HIDE_HELP_TEXT_DEFAULT
        )
        helptext = None

        if not hide_help_text:
            # Generate help text using helper function
            detailed_help_text = pl.get_boolean_attrib(
                element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
            )
            show_number_correct = pl.get_boolean_attrib(
                element, "show-number-correct", SHOW_NUMBER_CORRECT_DEFAULT
            )

            min_options_to_select = _get_min_options_to_select(
                element, MIN_SELECT_DEFAULT
            )
            max_options_to_select = _get_max_options_to_select(
                element, len(display_answers)
            )

            helptext = generate_help_text(
                num_correct=len(correct_answer_list),
                num_display_answers=len(display_answers),
                show_number_correct=show_number_correct,
                detailed_help_text=detailed_help_text,
                has_min_select_attrib=pl.has_attrib(element, "min-select"),
                has_max_select_attrib=pl.has_attrib(element, "max-select"),
                min_options_to_select=min_options_to_select,
                max_options_to_select=max_options_to_select,
            )

            # Extract insert_text for backward compatibility with info_params
            # (This is needed for the grading text generation below)
            show_min_select = (
                pl.has_attrib(element, "min-select")
                and min_options_to_select != MIN_SELECT_DEFAULT
            )
            show_max_select = pl.has_attrib(
                element, "max-select"
            ) and max_options_to_select != len(display_answers)

            if show_number_correct:
                if len(correct_answer_list) == 1:
                    number_correct_text = (
                        " There is exactly <b>1</b> correct option in the list above."
                    )
                else:
                    number_correct_text = f" There are exactly <b>{len(correct_answer_list)}</b> correct options in the list above."
            else:
                number_correct_text = ""

            if detailed_help_text or (show_min_select and show_max_select):
                if min_options_to_select != max_options_to_select:
                    insert_text = f" between <b>{min_options_to_select}</b> and <b>{max_options_to_select}</b> options."
                else:
                    insert_text = f" exactly <b>{min_options_to_select}</b> options."
            elif show_min_select:
                insert_text = f" at least <b>{min_options_to_select}</b> options."
            elif show_max_select:
                insert_text = f" at most <b>{max_options_to_select}</b> options."
            else:
                insert_text = " at least 1 option."

            insert_text += number_correct_text

            # Generate grading text (still uses old partial credit method strings)
            if partial_credit:
                if partial_credit_method == "PC":
                    gradingtext = (
                        "You must select"
                        + insert_text
                        + " You will receive a score of <code>100% * (t - f) / n</code>, "
                        + "where <code>t</code> is the number of true options that you select, <code>f</code> "
                        + "is the number of false options that you select, and <code>n</code> is the total number of true options. "
                        + "At minimum, you will receive a score of 0%."
                    )
                elif partial_credit_method == "EDC":
                    gradingtext = (
                        "You must select"
                        + insert_text
                        + " You will receive a score of <code>100% * (t + f) / "
                        + str(len(display_answers))
                        + "</code>, "
                        + "where <code>t</code> is the number of true options that you select and <code>f</code> "
                        + "is the number of false options that you do not select."
                    )
                elif partial_credit_method == "COV":
                    gradingtext = (
                        "You must select"
                        + insert_text
                        + " You will receive a score of <code>100% * (t / c) * (t / n)</code>, "
                        + "where <code>t</code> is the number of true options that you select, <code>c</code> is the total number of true options, "
                        + "and <code>n</code> is the total number of options you select."
                    )
                else:
                    raise ValueError(
                        f"Unknown value for partial_credit_method: {partial_credit_method}"
                    )
            else:
                gradingtext = (
                    "You must select"
                    + insert_text
                    + " You will receive a score of 100% "
                    + "if you select all options that are true and no options that are false. "
                    + "Otherwise, you will receive a score of 0%."
                )

            info_params.update({"gradingtext": gradingtext})

        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()

        html_params = {
            "question": True,
            "name": name,
            "editable": editable,
            "uuid": pl.get_uuid(),
            "info": info,
            "answers": answerset,
            "inline": inline,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
            "helptext": helptext,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        if parse_error is None:
            partial_score = data["partial_scores"].get(name, {"score": None})
            feedback = partial_score.get("feedback", None)
            score = partial_score.get("score", None)

            answers = []
            for submitted_key in submitted_keys:
                submitted_answer = next(
                    filter(lambda a: a["key"] == submitted_key, display_answers)
                )
                answer_item = {
                    "key": submitted_key,
                    "html": submitted_answer["html"],
                    "display_score_badge": score is not None and show_answer_feedback,
                }
                if answer_item["display_score_badge"]:
                    answer_item["correct"] = submitted_key in correct_keys
                    answer_item["incorrect"] = submitted_key not in correct_keys
                answer_item["display_feedback"] = feedback and feedback.get(
                    submitted_key, None
                )
                answer_item["feedback"] = (
                    feedback.get(submitted_key, None) if feedback else None
                )
                answers.append(answer_item)

            html_params = {
                "submission": True,
                "display_score_badge": (score is not None),
                "answers": answers,
                "inline": inline,
                "hide_letter_keys": pl.get_boolean_attrib(
                    element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
                ),
            }

            # Add parameter for displaying overall score badge
            if score is not None:
                score_type, score_value = pl.determine_score_params(score)
                html_params[score_type] = score_value

            with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
                return chevron.render(f, html_params).strip()
        else:
            html_params = {
                "submission": True,
                "uuid": pl.get_uuid(),
                "parse_error": parse_error,
                "inline": inline,
            }
            with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
                return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        if pl.get_boolean_attrib(
            element, "hide-answer-panel", HIDE_ANSWER_PANEL_DEFAULT
        ):
            return ""
        correct_answer_list = data["correct_answers"].get(name, [])
        if len(correct_answer_list) == 0:
            raise ValueError("At least one option must be true.")
        html_params = {
            "answer": True,
            "inline": inline,
            "answers": correct_answer_list,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
        }
        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    else:
        assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    submitted_key = data["submitted_answers"].get(name, None)

    # Check that at least one option was selected
    if submitted_key is None:
        data["format_errors"][name] = "You must select at least one option."
        return

    # Get minimum and maximum number of options to be selected
    min_options_to_select = _get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = _get_max_options_to_select(
        element, len(data["params"][name])
    )

    # Check that the number of submitted answers is in the interval [min_options_to_select, max_options_to_select].
    if not (min_options_to_select <= len(submitted_key) <= max_options_to_select):
        if min_options_to_select != max_options_to_select:
            data["format_errors"][name] = (
                f"You must select between <b>{min_options_to_select}</b> and <b>{max_options_to_select}</b> options."
            )
        else:
            data["format_errors"][name] = (
                f"You must select exactly <b>{min_options_to_select}</b> options."
            )


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    number_answers = len(data["params"][name])

    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", PARTIAL_CREDIT_DEFAULT
    )
    partial_credit_method = pl.get_string_attrib(
        element, "partial-credit-method", PARTIAL_CREDIT_METHOD_DEFAULT
    )

    # Convert to internal enum
    partial_credit_type = _get_partial_credit_type(
        partial_credit, partial_credit_method
    )

    submitted_set = set(data["submitted_answers"].get(name, []))
    correct_set = {answer["key"] for answer in data["correct_answers"].get(name, [])}
    feedback = {
        option["key"]: option.get("feedback", None) for option in data["params"][name]
    }

    score = 0
    if partial_credit_type is PartialCreditType.ALL_OR_NOTHING:
        score = 1 if submitted_set == correct_set else 0
    elif partial_credit_type is PartialCreditType.NET_CORRECT:
        if submitted_set == correct_set:
            score = 1
        else:
            n_correct_answers = len(correct_set) - len(correct_set - submitted_set)
            points = n_correct_answers - len(submitted_set - correct_set)
            score = max(0, points / len(correct_set))
    elif partial_credit_type is PartialCreditType.EACH_ANSWER:
        number_wrong = len(submitted_set - correct_set) + len(
            correct_set - submitted_set
        )
        score = 1 - 1.0 * number_wrong / number_answers
    elif partial_credit_type is PartialCreditType.COVERAGE:
        n_correct_answers = len(correct_set & submitted_set)
        base_score = n_correct_answers / len(correct_set)
        guessing_factor = n_correct_answers / len(submitted_set)
        score = base_score * guessing_factor
    else:
        assert_never(partial_credit_type)

    data["partial_scores"][name] = {
        "score": score,
        "weight": weight,
        "feedback": feedback,
    }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", PARTIAL_CREDIT_DEFAULT
    )
    partial_credit_method = pl.get_string_attrib(
        element, "partial-credit-method", PARTIAL_CREDIT_METHOD_DEFAULT
    )

    # Convert to internal enum
    partial_credit_type = _get_partial_credit_type(
        partial_credit, partial_credit_method
    )

    correct_keys = {answer["key"] for answer in data["correct_answers"].get(name, [])}
    number_answers = len(data["params"][name])

    min_options_to_select = _get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = _get_max_options_to_select(element, number_answers)

    result = data["test_type"]

    if result == "correct":
        if len(correct_keys) == 1:
            data["raw_submitted_answers"][name] = correct_keys.pop()
        elif len(correct_keys) > 1:
            data["raw_submitted_answers"][name] = list(correct_keys)
        else:
            pass  # no raw_submitted_answer if no correct keys
        feedback = {
            option["key"]: option.get("feedback", None)
            for option in data["params"][name]
        }
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": feedback,
        }
    elif result == "incorrect":
        while True:
            # select answer keys at random
            ans = {
                k
                for k in map(pl.index2key, range(number_answers))
                if random.choice([True, False])
            }
            # break and use this choice if it isn't correct
            if (
                ans != correct_keys
                and min_options_to_select <= len(ans) <= max_options_to_select
            ):
                break
        if partial_credit_type is not PartialCreditType.ALL_OR_NOTHING:
            if partial_credit_type is PartialCreditType.NET_CORRECT:
                if ans == correct_keys:
                    score = 1
                else:
                    n_correct_answers = len(correct_keys) - len(correct_keys - ans)
                    points = n_correct_answers - len(ans - correct_keys)
                    score = max(0, points / len(correct_keys))
            elif partial_credit_type is PartialCreditType.EACH_ANSWER:
                number_wrong = len(ans - correct_keys) + len(correct_keys - ans)
                score = 1 - 1.0 * number_wrong / number_answers
            elif partial_credit_type is PartialCreditType.COVERAGE:
                n_correct_answers = len(correct_keys & ans)
                base_score = n_correct_answers / len(correct_keys)
                guessing_factor = n_correct_answers / len(ans)
                score = base_score * guessing_factor
            else:
                assert_never(partial_credit_type)
        else:
            score = 0
        feedback = {
            option["key"]: option.get("feedback", None)
            for option in data["params"][name]
        }
        data["raw_submitted_answers"][name] = list(ans)
        data["partial_scores"][name] = {
            "score": score,
            "weight": weight,
            "feedback": feedback,
        }
    elif result == "invalid":
        # FIXME: add more invalid examples
        data["raw_submitted_answers"][name] = None
        data["format_errors"][name] = "You must select at least one option."
    else:
        assert_never(result)


def _get_min_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
    """
    Given an HTML fragment containing a pl-checkbox element, returns the minimum number of options that must be selected in
    the checkbox element for a submission to be valid. In order of descending priority, the returned value equals:
        1. The value of the "min-select" attribute, if specified.
        2. The value of the "min-correct" attribute, if the "detailed-help-text" attribute is set to True.
        3. default_val otherwise.

    Note: this function should only be called from within this file.

    Returns:
        The minimum number of options that must be selected in the checkbox element for a submission to be valid
    """
    detailed_help_text = pl.get_boolean_attrib(
        element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
    )

    if pl.has_attrib(element, "min-select"):
        min_options_to_select = pl.get_integer_attrib(element, "min-select")
    elif pl.has_attrib(element, "min-correct") and detailed_help_text:
        min_options_to_select = pl.get_integer_attrib(element, "min-correct")
    else:
        min_options_to_select = default_val

    return min_options_to_select


def _get_max_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
    """
    Given an HTML fragment containing a pl-checkbox element, returns the maximum number of options that can be selected in
    the checkbox element for a submission to be valid. In order of descending priority, the returned value equals:
        1. The value of the "max-select" attribute, if specified.
        2. The value of the "max-correct" attribute, if the "detailed-help-text" attribute is set to True.
        3. default_val otherwise.

    Note: this function should only be called from within this file.

    Returns:
        The maximum number of options that can be selected in the checkbox element for a submission to be valid
    """
    detailed_help_text = pl.get_boolean_attrib(
        element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
    )

    if pl.has_attrib(element, "max-select"):
        max_options_to_select = pl.get_integer_attrib(element, "max-select")
    elif pl.has_attrib(element, "max-correct") and detailed_help_text:
        max_options_to_select = pl.get_integer_attrib(element, "max-correct")
    else:
        max_options_to_select = default_val

    return max_options_to_select

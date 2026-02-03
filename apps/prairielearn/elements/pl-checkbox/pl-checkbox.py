import html
import random
from enum import Enum
from itertools import count
from typing import Any, NamedTuple, cast

import chevron
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class PartialCreditType(Enum):
    OFF = "off"
    NET_CORRECT = "NET"
    EACH_ANSWER = "EACH"
    COVERAGE = "COV"


class OrderType(Enum):
    RANDOM = "random"
    FIXED = "fixed"


class DisplayType(Enum):
    BLOCK = "block"
    INLINE = "inline"


class AnswerTuple(NamedTuple):
    """Represents an answer option with its properties."""

    idx: int
    correct: bool
    html: str
    feedback: str | None


WEIGHT_DEFAULT = 1
PARTIAL_CREDIT_DEFAULT = PartialCreditType.OFF
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


def generate_number_correct_text(
    *,
    num_correct: int,
    show_number_correct: bool,
) -> str:
    """Generate text for the number of correct options."""
    if show_number_correct:
        if num_correct == 1:
            return " There is exactly <b>1</b> correct option in the list above."
        else:
            return f" There are exactly <b>{num_correct}</b> correct options in the list above."
    else:
        return ""


def generate_grading_text(
    *,
    insert_text: str,
    num_display_answers: int,
    partial_credit_mode: PartialCreditType,
) -> str:
    """Generate grading text for checkbox element."""
    grading_key = ""

    match partial_credit_mode:
        case PartialCreditType.NET_CORRECT:
            grading_key = "net-correct"
        case PartialCreditType.EACH_ANSWER:
            grading_key = "each-answer"
        case PartialCreditType.COVERAGE:
            grading_key = "coverage"
        case PartialCreditType.OFF:
            grading_key = "off"
        case _:
            assert_never(partial_credit_mode)

    grading_text_params = {
        "format": True,
        grading_key: True,
        "insert_text": insert_text,
        "num_display_answers": num_display_answers,
    }

    with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
        return chevron.render(f, grading_text_params).strip()


def generate_insert_text(
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
    number_correct_text = generate_number_correct_text(
        num_correct=num_correct, show_number_correct=show_number_correct
    )

    show_min_select = (
        has_min_select_attrib and min_options_to_select != MIN_SELECT_DEFAULT
    )
    show_max_select = (
        has_max_select_attrib and max_options_to_select != num_display_answers
    )

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

    return insert_text


def get_display_type(element: lxml.html.HtmlElement) -> DisplayType:
    """Convert external display attribute to internal enum.

    Args:
        element: The pl-checkbox HTML element

    Returns:
        DisplayType enum value

    Raises:
        ValueError: If both display and inline attributes are set
    """
    if pl.has_attrib(element, "display") and pl.has_attrib(element, "inline"):
        raise ValueError(
            "Cannot set both 'display' and 'inline' attributes. "
            "Use only 'display'; the 'inline' attribute is deprecated."
        )

    inline_default = False
    inline = pl.get_boolean_attrib(element, "inline", inline_default)
    display_type_default = DisplayType.INLINE if inline else DisplayType.BLOCK

    return pl.get_enum_attrib(element, "display", DisplayType, display_type_default)


def get_order_type(element: lxml.html.HtmlElement) -> OrderType:
    """Convert external fixed-order attribute to internal enum.

    Args:
        element: The pl-checkbox HTML element

    Returns:
        OrderType enum value

    Raises:
        ValueError: If both fixed-order and order attributes are set
    """
    if pl.has_attrib(element, "fixed-order") and pl.has_attrib(element, "order"):
        raise ValueError(
            'Setting answer choice order should be done with the "order" attribute.'
        )

    fixed_order_default = False
    fixed_order = pl.get_boolean_attrib(element, "fixed-order", fixed_order_default)
    order_type_default = OrderType.FIXED if fixed_order else OrderType.RANDOM

    return pl.get_enum_attrib(element, "order", OrderType, order_type_default)


def get_partial_credit_mode(element: lxml.html.HtmlElement) -> PartialCreditType:
    """Get partial credit mode with backward compatibility.

    New usage: partial-credit="off|coverage|each-answer|net-correct"
    Old usage: partial-credit="true|false" + partial-credit-method="PC|COV|EDC"

    Args:
        element: The pl-checkbox HTML element

    Returns:
        PartialCreditType enum value

    Raises:
        ValueError: If invalid partial-credit value or deprecated partial-credit-method is used with new style
    """
    if not pl.has_attrib(element, "partial-credit"):
        # No attribute specified, use default
        return PARTIAL_CREDIT_DEFAULT

    try:
        # Try to parse as boolean first (old style)
        # For modern attributes, this will raise an exception as they are part of an enum.
        partial_credit_bool = pl.get_boolean_attrib(element, "partial-credit")

        if not partial_credit_bool:
            # Old style: partial-credit="false"
            return PartialCreditType.OFF

        partial_credit_method = pl.get_string_attrib(
            element, "partial-credit-method", "PC"
        )
        old_to_new_mapping = {
            "PC": PartialCreditType.NET_CORRECT,
            "COV": PartialCreditType.COVERAGE,
            "EDC": PartialCreditType.EACH_ANSWER,
        }
        if partial_credit_method not in old_to_new_mapping:
            raise ValueError(
                f'Invalid partial-credit-method: {partial_credit_method}. Must be "PC", "COV", or "EDC".'
            )
        return old_to_new_mapping[partial_credit_method]
    except ValueError:
        # Silently fall over to new style parsing if the old style doesn't work
        pass

    # New style: partial-credit="off|coverage|each-answer|net-correct"
    if pl.has_attrib(element, "partial-credit-method"):
        raise ValueError(
            'You cannot set partial-credit-method and a non-boolean value for partial-credit. You likely want to remove partial-credit-method and use partial-credit="off|coverage|each-answer|net-correct" instead.'
        )
    try:
        return pl.get_enum_attrib(
            element, "partial-credit", PartialCreditType, PARTIAL_CREDIT_DEFAULT
        )
    except ValueError as e:
        raise ValueError(
            f"Invalid partial-credit value: {pl.get_string_attrib(element, 'partial-credit')}"
        ) from e


def validate_min_max_options(
    min_correct: int,
    max_correct: int,
    len_correct: int,
    len_incorrect: int,
    number_answers: int,
    min_select: int,
    max_select: int,
    min_select_default: int,
) -> None:
    """Validate that min/max select and correct options have sensible values.

    Args:
        min_correct: Minimum number of correct answers
        max_correct: Maximum number of correct answers
        len_correct: Total number of correct answers available
        len_incorrect: Total number of incorrect answers available
        number_answers: Total number of answers to display
        min_select: Minimum number of options that must be selected
        max_select: Maximum number of options that can be selected
        min_select_default: Default value for min_select

    Raises:
        ValueError: If any validation constraints are violated
    """
    if not (0 <= min_correct <= max_correct <= len_correct):
        raise ValueError(
            f"Invalid configuration: min-correct ({min_correct}) and max-correct ({max_correct}) must be between 0 and the number of correct answers ({len_correct})"
        )

    min_incorrect = number_answers - max_correct
    max_incorrect = number_answers - min_correct
    if not (0 <= min_incorrect <= max_incorrect <= len_incorrect):
        raise ValueError(
            f"Invalid configuration: The number of incorrect answers needed ({min_incorrect} to {max_incorrect}) exceeds the number of incorrect answers available ({len_incorrect})"
        )

    if min_select < min_select_default:
        raise ValueError(
            f"The attribute min-select is {min_select}, but must be at least {min_select_default}"
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
        "display",
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
        "order",
        # Deprecated
        "fixed-order",
        "inline",
    ]

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    # Don't use value but call getter here to do validation right away.
    get_partial_credit_mode(element)

    correct_answers, incorrect_answers = categorize_options(element)

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    if len_correct == 0:
        raise ValueError("At least one option must be true.")

    min_correct = pl.get_integer_attrib(element, "min-correct", MIN_CORRECT_DEFAULT)
    max_correct = pl.get_integer_attrib(element, "max-correct", len_correct)

    if min_correct < 1:
        raise ValueError(
            f"The attribute min-correct is {min_correct:d} but must be at least 1"
        )

    # Calculate number_answers based on what attributes are explicitly specified.
    # When max-correct is specified but number-answers is not, we should honor
    # max-correct by adjusting the total number of answers shown.
    if pl.has_attrib(element, "number-answers"):
        number_answers = pl.get_integer_attrib(element, "number-answers")
    elif pl.has_attrib(element, "max-correct"):
        number_answers = min(len_total, max_correct + len_incorrect)
    else:
        number_answers = len_total

    number_answers = max(0, min(len_total, number_answers))
    min_correct = min(
        len_correct, number_answers, max(0, number_answers - len_incorrect, min_correct)
    )
    max_correct = min(len_correct, number_answers, max(min_correct, max_correct))

    min_select = pl.get_integer_attrib(element, "min-select", MIN_SELECT_DEFAULT)
    max_select = pl.get_integer_attrib(element, "max-select", number_answers)

    # Check that min_select, max_select, number_answers, min_correct, and max_correct all have sensible values relative to each other.
    validate_min_max_options(
        min_correct=min_correct,
        max_correct=max_correct,
        len_correct=len_correct,
        len_incorrect=len_incorrect,
        number_answers=number_answers,
        min_select=min_select,
        max_select=max_select,
        min_select_default=MIN_SELECT_DEFAULT,
    )

    number_correct = random.randint(min_correct, max_correct)
    number_incorrect = number_answers - number_correct

    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    order_type = get_order_type(element)

    if order_type is OrderType.FIXED:
        # we can't simply skip the shuffle because we already broke the original
        # order by separating into correct/incorrect lists
        sampled_answers.sort(key=lambda a: a.idx)  # sort by stored original index
    elif order_type is OrderType.RANDOM:
        random.shuffle(sampled_answers)
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

    partial_credit_mode = get_partial_credit_mode(element)

    hide_score_badge = pl.get_boolean_attrib(
        element, "hide-score-badge", HIDE_SCORE_BADGE_DEFAULT
    )

    editable = data["editable"]
    # answer feedback is not displayed when partial credit is True
    # (unless the question is disabled)
    show_answer_feedback = True
    if (
        partial_credit_mode is not PartialCreditType.OFF and editable
    ) or hide_score_badge:
        show_answer_feedback = False

    display_answers = data["params"].get(name, [])
    inline = get_display_type(element) is DisplayType.INLINE
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
                and feedback is not None
                and type(feedback) is dict
                and feedback.get(answer["key"], None) is not None,
                "feedback": feedback.get(answer["key"], None)
                if type(feedback) is dict
                else feedback,
            }
            if answer_html["display_score_badge"]:
                answer_html["correct"] = answer["key"] in correct_keys
                answer_html["incorrect"] = answer["key"] not in correct_keys
            answerset.append(answer_html)

        grading_info = ""
        # Adds decorative help text per bootstrap formatting guidelines:
        # http://getbootstrap.com/docs/4.0/components/forms/#help-text
        # Determine whether we should add a choice selection requirement
        hide_help_text = pl.get_boolean_attrib(
            element, "hide-help-text", HIDE_HELP_TEXT_DEFAULT
        )
        helptext = None

        if not hide_help_text:
            detailed_help_text = pl.get_boolean_attrib(
                element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
            )
            show_number_correct = pl.get_boolean_attrib(
                element, "show-number-correct", SHOW_NUMBER_CORRECT_DEFAULT
            )

            min_options_to_select = get_min_options_to_select(
                element, MIN_SELECT_DEFAULT
            )
            max_options_to_select = get_max_options_to_select(
                element, len(display_answers)
            )

            has_min_select_attrib = pl.has_attrib(element, "min-select")
            has_max_select_attrib = pl.has_attrib(element, "max-select")
            num_display_answers = len(display_answers)

            insert_text = generate_insert_text(
                num_correct=len(correct_answer_list),
                num_display_answers=num_display_answers,
                show_number_correct=show_number_correct,
                detailed_help_text=detailed_help_text,
                has_min_select_attrib=has_min_select_attrib,
                has_max_select_attrib=has_max_select_attrib,
                min_options_to_select=min_options_to_select,
                max_options_to_select=max_options_to_select,
            )

            number_correct_text = generate_number_correct_text(
                num_correct=len(correct_answer_list),
                show_number_correct=show_number_correct,
            )

            show_min_select = (
                has_min_select_attrib and min_options_to_select != MIN_SELECT_DEFAULT
            )
            show_max_select = (
                has_max_select_attrib and max_options_to_select != num_display_answers
            )
            if detailed_help_text or show_min_select or show_max_select:
                helptext = (
                    f'<small class="form-text text-muted">Select {insert_text}</small>'
                )
            else:
                # This is the case where we reveal nothing about min_options_to_select and max_options_to_select.
                helptext = f'<small class="form-text text-muted">Select all possible options that apply.{number_correct_text}</small>'

            grading_info = generate_grading_text(
                insert_text=insert_text,
                num_display_answers=num_display_answers,
                partial_credit_mode=partial_credit_mode,
            )

        html_params: dict[str, Any] = {
            "question": True,
            "name": name,
            "editable": editable,
            "uuid": pl.get_uuid(),
            "info": grading_info,
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
            feedback = cast(dict[str, Any] | None, partial_score.get("feedback", None))
            score = partial_score.get("score", None)

            answers = []
            for submitted_key in submitted_keys:
                submitted_answer = next(
                    filter(lambda a: a["key"] == submitted_key, display_answers), None
                )
                if submitted_answer is None:
                    continue
                answer_item = {
                    "key": submitted_key,
                    "html": submitted_answer["html"],
                    "display_score_badge": score is not None and show_answer_feedback,
                }
                if answer_item["display_score_badge"]:
                    answer_item["correct"] = submitted_key in correct_keys
                    answer_item["incorrect"] = submitted_key not in correct_keys
                answer_item["display_feedback"] = (
                    feedback is not None
                    and feedback.get(submitted_key, None) is not None
                )
                answer_item["feedback"] = (
                    feedback.get(submitted_key, None) if feedback is not None else None
                )
                answers.append(answer_item)

            html_params: dict[str, Any] = {
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
    all_keys = [a["key"] for a in data["params"][name]]

    # Check that at least one option was selected
    if submitted_key is None:
        data["format_errors"][name] = "You must select at least one option."
        return

    # Check that the selected options are a subset of the valid options
    submitted_key_set = set(submitted_key)
    all_keys_set = set(all_keys)
    if not submitted_key_set.issubset(all_keys_set):
        one_bad_key = submitted_key_set.difference(all_keys_set).pop()
        data["format_errors"][name] = (
            f"You selected an invalid option: {html.escape(one_bad_key)}"
        )
        return

    # Get minimum and maximum number of options to be selected
    min_options_to_select = get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = get_max_options_to_select(
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
    partial_credit_mode = get_partial_credit_mode(element)
    number_answers = len(data["params"][name])
    submitted_keys = data["submitted_answers"].get(name, [])
    correct_answer_list = data["correct_answers"].get(name, [])
    correct_keys = [answer["key"] for answer in correct_answer_list]
    feedback = {
        option["key"]: option.get("feedback", None) for option in data["params"][name]
    }

    submitted_set = set(submitted_keys)
    correct_set = set(correct_keys)

    # TODO: compute this in a separate function for easier testing
    # if another method ever gets added.
    if partial_credit_mode is PartialCreditType.OFF:
        score = 1 if submitted_set == correct_set else 0
    elif partial_credit_mode is PartialCreditType.NET_CORRECT:
        if submitted_set == correct_set:
            score = 1
        else:
            n_correct_answers = len(correct_set) - len(correct_set - submitted_set)
            points = n_correct_answers - len(submitted_set - correct_set)
            score = max(0, points / len(correct_set))
    elif partial_credit_mode is PartialCreditType.EACH_ANSWER:
        number_wrong = len(submitted_set - correct_set) + len(
            correct_set - submitted_set
        )
        score = 1 - 1.0 * number_wrong / number_answers
    elif partial_credit_mode is PartialCreditType.COVERAGE:
        n_correct_answers = len(correct_set & submitted_set)
        base_score = n_correct_answers / len(correct_set)
        guessing_factor = n_correct_answers / len(submitted_set)
        score = base_score * guessing_factor
    else:
        assert_never(partial_credit_mode)

    data["partial_scores"][name] = {
        "score": score,
        "weight": weight,
        "feedback": feedback,
    }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    partial_credit_mode = get_partial_credit_mode(element)

    correct_answer_list = data["correct_answers"].get(name, [])
    correct_keys = [answer["key"] for answer in correct_answer_list]
    number_answers = len(data["params"][name])
    all_keys = [pl.index2key(i) for i in range(number_answers)]

    min_options_to_select = get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = get_max_options_to_select(element, number_answers)

    result = data["test_type"]

    if result == "correct":
        if len(correct_keys) == 1:
            data["raw_submitted_answers"][name] = correct_keys[0]
        elif len(correct_keys) > 1:
            data["raw_submitted_answers"][name] = correct_keys
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
            ans = [k for k in all_keys if random.choice([True, False])]
            # break and use this choice if it isn't correct
            if (
                set(ans) != set(correct_keys)
                and min_options_to_select <= len(ans) <= max_options_to_select
            ):
                break

        if partial_credit_mode is PartialCreditType.OFF:
            score = 0
        elif partial_credit_mode is PartialCreditType.NET_CORRECT:
            if set(ans) == set(correct_keys):
                score = 1
            else:
                n_correct_answers = len(set(correct_keys)) - len(
                    set(correct_keys) - set(ans)
                )
                points = n_correct_answers - len(set(ans) - set(correct_keys))
                score = max(0, points / len(set(correct_keys)))
        elif partial_credit_mode is PartialCreditType.EACH_ANSWER:
            number_wrong = len(set(ans) - set(correct_keys)) + len(
                set(correct_keys) - set(ans)
            )
            score = 1 - 1.0 * number_wrong / number_answers
        elif partial_credit_mode is PartialCreditType.COVERAGE:
            n_correct_answers = len(set(correct_keys) & set(ans))
            base_score = n_correct_answers / len(set(correct_keys))
            guessing_factor = n_correct_answers / len(set(ans))
            score = base_score * guessing_factor
        else:
            assert_never(partial_credit_mode)

        feedback = {
            option["key"]: option.get("feedback", None)
            for option in data["params"][name]
        }
        data["raw_submitted_answers"][name] = ans
        data["partial_scores"][name] = {
            "score": score,
            "weight": weight,
            "feedback": feedback,
        }
    elif result == "invalid":
        # Note that we deliberately do NOT write `None` values to `data["raw_submitted_answers"]`.
        # This mimics what a browser does when no checkbox is selected: we simply get no value
        # for that form field.
        data["format_errors"][name] = "You must select at least one option."
    else:
        assert_never(result)


def get_min_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
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


def get_max_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
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

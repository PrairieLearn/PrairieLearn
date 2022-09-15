import chevron
import lxml.html
import prairielearn as pl
from typing import TypedDict, Tuple, List

class HintsDict(TypedDict):
    "A class with type signatures for the partial scores dict"
    html_hints: List[Tuple[int, str]]
    submission_count: int

def prepare(element_html: str, data: pl.QuestionData) -> None:
    # Set submit count
    if ('hidden-hints' in data['params']):
        raise ValueError("Duplicate params key: 'hidden-hints'.")

    hints_dict = data['params'].setdefault('hidden-hints', dict())
    hints_dict['submission_count'] = 0

    # Parse hints from frontend
    element = lxml.html.fragment_fromstring(element_html)

    html_hints = []

    # Read hints defined as child tags and load them into html_hints
    for i, child in enumerate(element):
        if child.tag == 'pl-hint':
            pl.check_attribs(child, ['show-after'], [])
            priority = pl.get_integer_attrib(child, 'show-after')
            html_hints.append((priority, pl.inner_html(child)))
        else:
            raise Exception(f"Child tag type '{child.tag}' not supported by hidden-hints.")

    hints_dict['html_hints'] = html_hints


def render(element_html: str, data: pl.QuestionData) -> str:
    # No need to display hints on answer / submission panels

    if data['panel'] == 'question':
        hints_dict: HintsDict = data['params']['hidden-hints']

        html_hints = hints_dict['html_hints']

        # A little bit of a hack to make it so that all of the backend hints are closed.
        param_hints = [(-1, hint) for hint in data['params'].get("hints", [])]

        if param_hints and html_hints:
            raise ValueError("Hints given as both HTML and parameters. Only one can be used.")

        # Sort based on priority
        hint_list = sorted(html_hints) if html_hints else param_hints
        hints_to_display = []

        submission_count = hints_dict.get('submission_count', 0)

        all_correct = all_questions_correct(data)

        # Parse through hint list to display hints.
        for (idx, (priority, hint)) in enumerate(hint_list):
            if priority <= submission_count:
                # Close hints once all questions are correct
                show_open = not all_correct and priority == submission_count
                hints_to_display.append({
                    "hint": hint,
                    "index": idx + 1,
                    "isOpen": 'open' if show_open else ''
                })

        with open('pl-hidden-hints.mustache', 'r') as f:
            return chevron.render(f, {
                "hints": hints_to_display,
                "isPlural": len(hints_to_display) > 1
            }).strip()

    else:
        return ''

def all_questions_correct(data: pl.QuestionData) -> bool:
    "Return True if all questions are correct in partial scores and it's nonempty."
    partial_scores = data["partial_scores"]

    if len(partial_scores) == 0:
        return False

    return all(part["score"] == 1.0 for part in partial_scores.values())

def grade(element_html: str, data: pl.QuestionData) -> None:
    hints_dict: HintsDict = data['params']['hidden-hints']

    # Only reveal next hint if the previous answer was valid
    # (i.e. didn't contain any format errors) but incorrect.
    if (len(data['format_errors']) == 0 and
        not all_questions_correct(data)):
        hints_dict['submission_count'] += 1


def test(element_html: str, data: pl.ElementTestData) -> None:
    # TODO write this!!!
    pass

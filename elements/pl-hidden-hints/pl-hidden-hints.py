import chevron
import lxml.html
import prairielearn as pl
from typing import TypedDict, Tuple, List


class HintsDict(TypedDict):
    """A class with type signatures for the partial scores dict"""
    html_hints: List[Tuple[int, str]]


def get_param_key(name_prefix: str) -> str:
    return f'{name_prefix}_hidden_hints'


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, [], ['name'])

    name_prefix = pl.get_string_attrib(element, 'name', '')
    param_key = get_param_key(name_prefix)

    # Set param dict using prefix. The use of a prefix allows for multiple hint panels.
    if (param_key in data['params']):
        raise ValueError(f"Duplicate params key: '{param_key}'.")

    hints_dict = data['params'].setdefault(param_key, dict())

    # Parse hints from frontend
    html_hints = []

    # Read hints defined as child tags and load them into html_hints
    for i, child in enumerate(element):
        if child.tag == 'pl-hint':
            pl.check_attribs(child, [], ['show-after'])

            # Default show-after to -1 to automatically show hint (closed) at start
            priority = pl.get_integer_attrib(child, 'show-after', -1)
            html_hints.append((priority, pl.inner_html(child)))
        else:
            raise Exception(f"Child tag type '{child.tag}' not supported by pl-hidden-hints.")

    hints_dict['html_hints'] = html_hints


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name_prefix = pl.get_string_attrib(element, 'name', '')
    param_key = get_param_key(name_prefix)

    hints_dict: HintsDict = data['params'][param_key]

    # Sort based on priority
    hint_list = sorted(hints_dict['html_hints'])
    hints_to_display = []

    submission_count = data['num_valid_submissions']
    all_correct = data['score'] == 1.0

    # Parse through hint list to display hints.
    for (idx, (priority, hint)) in enumerate(hint_list):
        if priority <= submission_count:
            # Close hints once all questions are correct
            show_open = not all_correct and priority == submission_count
            hints_to_display.append({
                'hint': hint,
                'index': idx + 1,
                'is_open': show_open
            })

    with open('pl-hidden-hints.mustache', 'r') as f:
        return chevron.render(f, {
            'hints': hints_to_display,
            'is_plural': len(hints_to_display) > 1
        }).strip()


def test(element_html: str, data: pl.ElementTestData) -> None:
    # TODO write this!!!
    pass

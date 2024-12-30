import math
from typing import Optional

import chevron
import lxml.etree
import lxml.html
import prairielearn as pl

# Based on the original hidden-hint element by Jason Xia

PRIORITY_DEFAULT = -1
HINT_NAME_DEFAULT = None


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, [], [])

    # Parse hints from frontend
    hints: list[tuple[int, int, Optional[str], str]] = []

    # Use position so that hints appear in order if show-after-submission values are equal.
    for position, child in enumerate(element):
        if child.tag == "pl-hint":
            pl.check_attribs(child, [], ["show-after-submission", "hint-name"])

            # Default show-after-submission to -1 to automatically show hint (closed) at start
            priority = pl.get_integer_attrib(
                child, "show-after-submission", PRIORITY_DEFAULT
            )
            hint_name = pl.get_string_attrib(child, "hint-name", HINT_NAME_DEFAULT)

            hints.append((priority, position, hint_name, pl.inner_html(child)))

        elif child.tag is lxml.etree.Comment:
            continue

        else:
            raise ValueError(
                f"Tags inside of pl-hidden-hints must be pl-hint, not '{child.tag}'."
            )

    # Sort hints by priority before displaying
    submission_count = data["num_valid_submissions"]
    all_correct = math.isclose(data["score"], 1.0)

    hints_to_display = []

    for idx, (priority, _, hint_name, hint) in enumerate(sorted(hints), 1):
        # Only display a hint if we're above the submission count
        if priority <= submission_count:
            # Close hints once all questions are correct
            hint_dict = {
                "hint": hint,
                "index": idx,
                "is_open": not all_correct and priority == submission_count,
                "hint_name": hint_name if hint_name is not None else f"Hint #{idx}",
            }

            hints_to_display.append(hint_dict)

    with open("pl-hidden-hints.mustache", "r") as f:
        return chevron.render(f, {"hints": hints_to_display}).strip()

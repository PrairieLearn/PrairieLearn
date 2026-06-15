import importlib
from pathlib import Path
from typing import Any

import lxml.html
import pytest

pl_overlay = importlib.import_module("pl-overlay")


def make_question_data() -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "feedback": {},
        "raw_submitted_answers": {},
        "options": {},
        "panel": "question",
        "editable": True,
    }


OVERLAY_WITH_BACKGROUND = """
<pl-overlay width="700" height="400">
    <pl-background>
        <img src="map.png" width="700" height="400" alt="Map of Europe">
    </pl-background>
    <pl-location left="460" top="290">
        <pl-string-input answers-name="country" aria-label="Unlabeled country"></pl-string-input>
    </pl-location>
</pl-overlay>
"""


def test_background_is_inert(monkeypatch: pytest.MonkeyPatch) -> None:
    """The background layer must be removed from the tab order and accessibility
    tree so it does not conflict with overlaid submission elements.

    Regression test for https://github.com/PrairieLearn/PrairieLearn/issues/15096
    (WCAG 2.1.1 Keyboard, 2.4.3 Focus Order).
    """
    monkeypatch.chdir(Path(__file__).parent)
    data = make_question_data()

    pl_overlay.prepare(OVERLAY_WITH_BACKGROUND, data)
    rendered = pl_overlay.render(OVERLAY_WITH_BACKGROUND, data)

    tree = lxml.html.fragment_fromstring(rendered)

    background = tree.find_class("pl-overlay-background")
    assert len(background) == 1, "Background should be wrapped in a single container"
    assert "inert" in background[0].attrib, (
        "Background container must carry the inert attribute so it is excluded "
        "from the tab order and accessibility tree"
    )

    # The background content must still live inside the inert wrapper.
    assert background[0].find(".//img") is not None

    # The interactive overlaid location must NOT be inert.
    locations = tree.find_class("pl-overlay-location")
    assert len(locations) == 1
    assert "inert" not in locations[0].attrib


def test_overlay_without_background_has_no_inert_wrapper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An overlay with no background should not emit an inert background wrapper."""
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
    <pl-overlay width="200" height="200">
        <pl-location left="10" top="10">Label</pl-location>
    </pl-overlay>
    """
    data = make_question_data()

    pl_overlay.prepare(element_html, data)
    rendered = pl_overlay.render(element_html, data)

    tree = lxml.html.fragment_fromstring(rendered)
    assert len(tree.find_class("pl-overlay-background")) == 0

import importlib
from typing import Any

import pytest

pl_excalidraw = importlib.import_module("pl-excalidraw")


def make_question_data() -> dict[str, Any]:
    return {"answers_names": {}}


@pytest.mark.parametrize(("attrib", "value"), [("width", "900"), ("height", "900")])
def test_prepare_rejects_unitless_size(attrib: str, value: str) -> None:
    element_html = (
        f'<pl-excalidraw answers-name="drawing" {attrib}="{value}"></pl-excalidraw>'
    )

    with pytest.raises(
        ValueError, match=f'Attribute "{attrib}" must be a CSS size value'
    ):
        pl_excalidraw.prepare(element_html, make_question_data())


def test_prepare_accepts_css_size_values() -> None:
    element_html = '<pl-excalidraw answers-name="drawing" width="100%" height="900px"></pl-excalidraw>'

    pl_excalidraw.prepare(element_html, make_question_data())

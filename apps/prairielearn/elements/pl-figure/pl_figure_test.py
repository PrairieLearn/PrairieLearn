import importlib
from pathlib import Path

import lxml.html
import pytest

figure = importlib.import_module("pl-figure")


@pytest.mark.parametrize("display", ["block", "inline"])
@pytest.mark.parametrize(
    ("alt_attribute", "expected_alt"),
    [
        ("", None),
        ('alt=""', ""),
    ],
)
def test_render_alt_text(
    display: str,
    alt_attribute: str,
    expected_alt: str | None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    output = figure.render(
        f'<pl-figure file-name="figure.png" display="{display}" {alt_attribute}></pl-figure>',
        {"options": {"client_files_question_url": "/clientFilesQuestion"}},
    )
    image = lxml.html.fromstring(output).xpath("//img")[0]

    assert image.get("alt") == expected_alt

import importlib
from pathlib import Path
from typing import Any

import pytest

variable_output = importlib.import_module("pl-variable-output")


def make_question_data() -> dict[str, Any]:
    return {"params": {"x": [[1, 2], [3, 4]]}}


def render_variable_output(
    monkeypatch: pytest.MonkeyPatch,
    element_html: str,
) -> str:
    monkeypatch.chdir(Path(__file__).parent)
    data = make_question_data()

    variable_output.prepare(element_html, data)
    return variable_output.render(element_html, data)


@pytest.mark.parametrize("default_tab", ["numpy", "python"])
def test_numpy_default_tab_and_deprecated_python_alias(
    monkeypatch: pytest.MonkeyPatch,
    default_tab: str,
) -> None:
    rendered = render_variable_output(
        monkeypatch,
        f"""
        <pl-variable-output
          default-tab="{default_tab}"
          show-matlab="false"
          show-mathematica="false"
          show-r="false"
          show-sympy="false"
        >
          <pl-variable params-name="x">x</pl-variable>
        </pl-variable-output>
        """,
    )

    assert ">NumPy</a>" in rendered
    assert ">Python</a>" not in rendered
    assert '<div role="tabpanel" class="tab-pane active" id="numpy-' in rendered
    assert "x = np.array(" in rendered


@pytest.mark.parametrize("show_numpy_attribute", ["show-numpy", "show-python"])
def test_show_numpy_and_deprecated_show_python_alias_hide_numpy_tab(
    monkeypatch: pytest.MonkeyPatch,
    show_numpy_attribute: str,
) -> None:
    rendered = render_variable_output(
        monkeypatch,
        f"""
        <pl-variable-output
          {show_numpy_attribute}="false"
          show-matlab="false"
          show-mathematica="false"
          show-sympy="false"
        >
          <pl-variable params-name="x">x</pl-variable>
        </pl-variable-output>
        """,
    )

    assert ">NumPy</a>" not in rendered
    assert ">R</a>" in rendered


def test_show_numpy_and_show_python_cannot_both_be_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = """
    <pl-variable-output show-numpy="true" show-python="true">
      <pl-variable params-name="x">x</pl-variable>
    </pl-variable-output>
    """

    with pytest.raises(
        ValueError,
        match='Cannot set both "show-numpy" and "show-python" attributes',
    ):
        variable_output.render(element_html, make_question_data())

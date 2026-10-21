import ast
from pathlib import Path
from typing import TypeGuard

import pytest

ELEMENTS_DIR = Path(__file__).parents[2] / "elements"


def _is_internal_import(
    node: ast.AST,
) -> TypeGuard[ast.Import | ast.ImportFrom]:
    if isinstance(node, ast.Import):
        return any(
            alias.name == "prairielearn.internal"
            or alias.name.startswith("prairielearn.internal.")
            for alias in node.names
        )

    return isinstance(node, ast.ImportFrom) and (
        node.module == "prairielearn.internal"
        or (
            node.module is not None and node.module.startswith("prairielearn.internal.")
        )
        or (
            node.module == "prairielearn"
            and any(alias.name == "internal" for alias in node.names)
        )
    )


def _find_internal_imports(source: str) -> list[int]:
    return [
        node.lineno for node in ast.walk(ast.parse(source)) if _is_internal_import(node)
    ]


@pytest.mark.parametrize(
    "source",
    [
        "import prairielearn.internal.raw_input",
        "from prairielearn.internal.raw_input import render_raw_input_popover",
        "from prairielearn import internal",
    ],
)
def test_internal_import_detection(source: str) -> None:
    assert _find_internal_imports(source) == [1]


def test_elements_do_not_import_prairielearn_internal() -> None:
    violations = [
        f"{path.relative_to(ELEMENTS_DIR)}:{line}"
        for path in sorted(ELEMENTS_DIR.rglob("*.py"))
        for line in _find_internal_imports(path.read_text())
    ]

    assert not violations, "Elements must use public PrairieLearn APIs:\n" + "\n".join(
        violations
    )

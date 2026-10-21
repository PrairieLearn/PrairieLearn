import ast
import subprocess
import sys
from pathlib import Path

import pytest

_PYTHON_ROOT = Path(__file__).parent.parent
_PACKAGE_ROOT = _PYTHON_ROOT / "prairielearn"
_CORE_MODULES = ("sympy_constants", "sympy_source")


def _module_source(module: str) -> Path:
    return _PACKAGE_ROOT / "internal" / f"{module}.py"


def _imports_public_sympy_utils(node: ast.AST) -> bool:
    if isinstance(node, ast.Import):
        return any(alias.name == "prairielearn.sympy_utils" for alias in node.names)
    return (
        isinstance(node, ast.ImportFrom) and node.module == "prairielearn.sympy_utils"
    )


def _imports_internal_sympy_module(node: ast.AST) -> bool:
    if isinstance(node, ast.Import):
        return any(
            alias.name.startswith("prairielearn.internal.sympy_")
            for alias in node.names
        )
    if not isinstance(node, ast.ImportFrom) or node.module is None:
        return False
    if node.module.startswith("prairielearn.internal.sympy_"):
        return True
    return node.module == "prairielearn.internal" and any(
        alias.name.startswith("sympy_") for alias in node.names
    )


@pytest.mark.parametrize(
    "modules",
    [
        (
            "prairielearn.sympy_utils",
            "prairielearn.internal.symbolic_input",
            "prairielearn.internal.sympy_source",
        ),
        (
            "prairielearn.internal.symbolic_input",
            "prairielearn.sympy_utils",
            "prairielearn.internal.sympy_source",
        ),
        (
            "prairielearn.internal.sympy_source",
            "prairielearn.internal.sympy_constants",
            "prairielearn.sympy_utils",
        ),
    ],
)
def test_sympy_modules_import_in_fresh_process(modules: tuple[str, ...]) -> None:
    imports = "; ".join(f"import {module}" for module in modules)
    subprocess.run(
        [
            sys.executable,
            "-c",
            f"import sys; sys.path.insert(0, {_PYTHON_ROOT.as_posix()!r}); {imports}",
        ],
        check=True,
    )


@pytest.mark.parametrize("module", _CORE_MODULES)
def test_core_sympy_modules_do_not_import_public_facade(module: str) -> None:
    tree = ast.parse(_module_source(module).read_text())
    assert not any(_imports_public_sympy_utils(node) for node in ast.walk(tree))


def test_public_sympy_facade_has_no_function_local_internal_imports() -> None:
    source = (_PACKAGE_ROOT / "sympy_utils.py").read_text()
    tree = ast.parse(source)
    functions = (
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    )
    assert not any(
        _imports_internal_sympy_module(node)
        for function in functions
        for node in ast.walk(function)
    )

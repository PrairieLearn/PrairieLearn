from pathlib import Path

import pytest
from check_python_dependencies import check_dependencies


def write_manifest(root: Path, name: str, contents: str) -> Path:
    """Create a dependency manifest in a temporary repository layout."""
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents)
    return path


def test_partial_pillow_update(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A grader-only update fails until the application and both workspaces match."""
    root = write_manifest(
        tmp_path, "pyproject.toml", '[project]\ndependencies = ["pillow==12.3.0"]\n'
    )
    write_manifest(tmp_path, "graders/python/requirements.txt", "Pillow==13.0.0\n")
    workspaces = [
        write_manifest(
            tmp_path, f"workspaces/{name}/requirements.txt", "Pillow==12.3.0\n"
        )
        for name in ("jupyterlab-python", "vscode-python")
    ]

    assert check_dependencies(tmp_path) == 1
    output = capsys.readouterr().out
    assert "Inconsistent versions of pillow:" in output
    assert "pyproject.toml: 12.3.0" in output
    assert "graders/python/requirements.txt: 13.0.0" in output
    for workspace in workspaces:
        assert f"{workspace.relative_to(tmp_path)}: 12.3.0" in output

    root.write_text('[project]\ndependencies = ["pillow==13.0.0"]\n')
    for workspace in workspaces:
        workspace.write_text("Pillow==13.0.0\n")
    assert check_dependencies(tmp_path) == 0


def test_discovers_shared_image_only_dependencies(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """New images and packages absent from the root manifest are still compared."""
    write_manifest(
        tmp_path, "graders/new-grader/requirements.txt", "Example_Package==1.0\n"
    )
    write_manifest(
        tmp_path,
        "workspaces/new-workspace/requirements.txt",
        "example.package[extra] == 2.0 # pin\n",
    )

    assert check_dependencies(tmp_path) == 1
    output = capsys.readouterr().out
    assert "Inconsistent versions of example-package:" in output
    assert "graders/new-grader/requirements.txt: 1.0" in output
    assert "workspaces/new-workspace/requirements.txt: 2.0" in output


def test_pyproject_dependency_sections(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Compare helper dependencies, optional dependencies, and dependency groups."""
    write_manifest(
        tmp_path,
        "pyproject.toml",
        '[project]\ndependencies = ["numpy==2.4.6"]\n'
        '[project.optional-dependencies]\nextra = ["lxml==6.1.3"]\n'
        '[dependency-groups]\ndocs = ["pygments==2.21.0"]\n'
        'dev = [{include-group = "docs"}]\n',
    )
    write_manifest(
        tmp_path,
        "apps/prairielearn/python/pyproject.toml",
        '[project]\ndependencies = ["numpy==2.4.5"]\n',
    )
    write_manifest(
        tmp_path, "graders/c/requirements.txt", "lxml==6.1.2\nPygments==2.20.0\n"
    )

    assert check_dependencies(tmp_path) == 1
    output = capsys.readouterr().out
    for name in ("numpy", "lxml", "pygments"):
        assert f"Inconsistent versions of {name}:" in output
    assert "apps/prairielearn/python/pyproject.toml: 2.4.5" in output


def test_ignores_conditional_requirements_and_unmanaged_manifests(
    tmp_path: Path,
) -> None:
    """Ranges and environment-specific versions do not impose a shared exact pin."""
    write_manifest(
        tmp_path,
        "pyproject.toml",
        '[project]\ndependencies = ["pillow==13.0.0", "numpy==2.4.6", "lxml==6.1.3"]\n',
    )
    write_manifest(
        tmp_path,
        "workspaces/vscode-python/requirements.txt",
        '# Dependencies\nPillow==12.3.0; python_version < "3.11"\nnumpy>=2.0\nlxml==6.*\n',
    )
    write_manifest(tmp_path, "exampleCourse/requirements.txt", "Pillow==12.3.0\n")
    write_manifest(tmp_path, ".venv/requirements.txt", "Pillow==12.3.0\n")

    assert check_dependencies(tmp_path) == 0

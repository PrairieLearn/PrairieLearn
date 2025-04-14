from pathlib import Path

import mkdocs_gen_files

PYTHON_ROOT = Path("apps") / "prairielearn" / "python"
PRAIRIELEARN_ROOT = PYTHON_ROOT / "prairielearn"

IGNORE = [
    "__init__",
    "internal",
]


def build_and_write_nav() -> None:
    # Currently, we have a flat structure, so we don't need to recurse.
    for path in sorted(PRAIRIELEARN_ROOT.glob("*.py")):
        # Ignore internal code
        if any(ignore in path.name for ignore in IGNORE):
            continue
        file_path = path.relative_to(PYTHON_ROOT).with_suffix("")
        full_doc_path = Path("python-reference") / file_path.with_suffix(".md")

        mkdocs_gen_files.set_edit_path(full_doc_path, ".." / path)
        # If the file already exists, skip it
        source_doc_path = Path("docs") / full_doc_path
        if not source_doc_path.exists():
            with mkdocs_gen_files.open(full_doc_path, "w") as f:
                ident = ".".join(file_path.parts)
                print("::: " + ident, file=f)


if __name__ in ["__main__", "<run_path>"]:
    build_and_write_nav()

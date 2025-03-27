from pathlib import Path

import mkdocs_gen_files

PYTHON_ROOT = Path("apps") / "prairielearn" / "python"
PRAIRIELEARN_ROOT = PYTHON_ROOT / "prairielearn"

IGNORE = [
    "__init__",
    "internal",
    "to_precision",  # Ignore to_precision as import gets messed up
]


def build_and_write_nav() -> None:
    """Build the navigation for the Python reference and write it to the SUMMARY.md file."""
    nav = mkdocs_gen_files.Nav()
    # Currently, we have a flat structure, so we don't need to recurse.
    for path in sorted(PRAIRIELEARN_ROOT.glob("*.py")):
        # Ignore internal code
        if any(ignore in path.name for ignore in IGNORE):
            continue
        file_path = path.relative_to(PYTHON_ROOT).with_suffix("")
        module_path = path.relative_to(PRAIRIELEARN_ROOT).with_suffix("")
        full_doc_path = Path("python-reference") / file_path.with_suffix(".md")
        toc_path = [
            f'<code class="doc-symbol doc-symbol-nav doc-symbol-module"></code> {part}'
            for part in module_path.parts
        ]
        nav[toc_path] = file_path.with_suffix(".md")

        mkdocs_gen_files.set_edit_path(full_doc_path, ".." / path)
        # If the file already exists, skip it
        source_doc_path = Path("docs") / full_doc_path
        if not source_doc_path.exists():
            with mkdocs_gen_files.open(full_doc_path, "w") as f:
                ident = ".".join(file_path.parts)
                print("::: " + ident, file=f)

    with mkdocs_gen_files.open("python-reference/SUMMARY.md", "w") as nav_file:
        nav_file.writelines(nav.build_literate_nav())


if __name__ in ["__main__", "<run_path>"]:
    build_and_write_nav()

from pathlib import Path

import mkdocs_gen_files

PYTHON_ROOT = Path("apps") / "prairielearn" / "python"
PRAIRIELEARN_ROOT = PYTHON_ROOT / "prairielearn"

IGNORE = [
    "__init__",
    "internal",
]

NAV_LOCATION = "Instructor Guide/Python API reference/"


def build_page_lookup(node: dict | list, path: list[str] | None = None) -> None:  # type: ignore
    """Builds a mapping from nav path to title."""
    if path is None:
        path = []
    if isinstance(node, list):
        for item in node:
            build_page_lookup(item, path)
    elif isinstance(node, dict):
        key = next(iter(node.keys()))
        value = node[key]
        if isinstance(value, str):
            lookup_map["/".join([*path, value])] = key
        else:
            build_page_lookup(value, [*path, key])


def build_and_write_nav(lookup_map: dict[str, str]) -> None:
    """Build the navigation for the Python reference and write it to the SUMMARY.md file."""
    # Currently, we have a flat structure, so we don't need to recurse.
    for path in sorted(PRAIRIELEARN_ROOT.glob("*.py")):
        # Ignore internal code
        if any(ignore in path.name for ignore in IGNORE):
            continue
        file_path = path.relative_to(PYTHON_ROOT).with_suffix("")
        full_doc_path = Path("python-reference") / file_path.with_suffix(".md")
        title = lookup_map.get(NAV_LOCATION + full_doc_path.as_posix())
        mkdocs_gen_files.set_edit_path(full_doc_path, ".." / path)
        # If the file already exists, skip it
        source_doc_path = Path("docs") / full_doc_path
        if not source_doc_path.exists():
            with mkdocs_gen_files.open(full_doc_path, "w") as f:
                if title:
                    print(f"# {title}", file=f)
                ident = ".".join(file_path.parts)
                print("::: " + ident, file=f)


if __name__ in ["__main__", "<run_path>"]:
    nav_root = mkdocs_gen_files.config.nav
    lookup_map = {}
    build_page_lookup(nav_root)
    build_and_write_nav(lookup_map)

from pathlib import Path

import mkdocs_gen_files

DOCS = Path("docs")

# TODO: Replace this generated alias with a physical accessControl.md file after
# the review-friendly source-file rename has landed.
ALIASES = {
    "assessment/accessControl.md": DOCS / "assessment/accessControlModern.md",
}


def generate_access_control_aliases() -> None:
    """Generate public access-control pages from review-friendly source files."""
    for output_path, source_path in ALIASES.items():
        with mkdocs_gen_files.open(output_path, "w") as output_file:
            output_file.write(source_path.read_text(encoding="utf-8"))

        mkdocs_gen_files.set_edit_path(output_path, source_path.relative_to(DOCS))


if __name__ in ["__main__", "<run_path>"]:
    generate_access_control_aliases()

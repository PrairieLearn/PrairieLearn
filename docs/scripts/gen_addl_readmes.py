"""
This script generates copies README files into the PrairieLearn documentation.
It processes the README files from specified source directories, modifies links to point
to the corresponding files on GitHub, and creates a navigation structure for the documentation.
"""

import re
from pathlib import Path
from types import SimpleNamespace

import mkdocs_gen_files

ROOT = Path.cwd()
SOURCE_ROOT = "https://github.com/PrairieLearn/PrairieLearn/blob/master/"

# Any links need to be replaced with a link to the file on GitHub
relative_regex = r"\[(.*?)\]\((\..*?)\)"
relative_regex_img = r"!\[(.*?)\]\((\..*?)\)"
readmes_mapping = [
    SimpleNamespace(**v) for v in mkdocs_gen_files.config.extra["addl_readmes"]
]


def build_readme_nav() -> None:
    nav = mkdocs_gen_files.Nav()
    robot_notice = """
!!! note
    This file was spliced into the documentation.
""".strip()
    for mapping in readmes_mapping:
        base = Path(mapping.src).absolute()
        doc_path = Path(mapping.dest)
        for path in base.rglob("README.md"):
            path_relative_to_base = path.relative_to(base)
            path_relative_to_root = path.relative_to(ROOT)

            doc_readme_path = doc_path / path_relative_to_base
            doc_readme_path.parent.mkdir(parents=True, exist_ok=True)
            with mkdocs_gen_files.open(doc_readme_path, "w") as f:
                contents = path.read_text()
                contents = re.sub(
                    relative_regex_img,
                    rf"![\1]({SOURCE_ROOT}{path_relative_to_root.parent}/\2?raw=true)",
                    contents,
                )
                contents = re.sub(
                    relative_regex,
                    rf'[\1]({SOURCE_ROOT}{path_relative_to_root.parent}/\2 "External link")',
                    contents,
                )
                header, body = contents.split("\n", 1)
                print(header, file=f)
                print(robot_notice, file=f)
                print(body, file=f)

            if path_relative_to_base.parent.as_posix() == ".":
                continue
            nav[path_relative_to_base.parent.parts] = path_relative_to_base.as_posix()
            mkdocs_gen_files.set_edit_path(
                doc_readme_path, ".." / path_relative_to_root
            )
        with mkdocs_gen_files.open(doc_path / "SUMMARY.md", "w") as nav_file:
            nav_file.writelines(nav.build_literate_nav())


if __name__ in ["__main__", "<run_path>"]:
    build_readme_nav()

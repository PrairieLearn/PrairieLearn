import re
from pathlib import Path

import mkdocs_gen_files

EXCLUDE = {
    "docs",
    "exampleCourse",
    ".venv",
    "node_modules",
    "dist",
    ".pytest_cache",
    ".changeset",
}
ROOT = Path.cwd()
DOC_ROOT = ROOT / "docs"
SOURCE_ROOT = "https://github.com/PrairieLearn/PrairieLearn/blob/master/"

# Any links need to be replaced with a link to the file on GitHub
relative_regex = r"\[(.*?)\]\((\..*?)\)"
relative_regex_img = r"!\[(.*?)\]\((\..*?)\)"


def build_readme_nav() -> None:
    nav = mkdocs_gen_files.Nav()

    for path in ROOT.rglob("README.md"):
        path_relative_to_root = path.relative_to(ROOT)
        # Ignore the root README
        if len(path_relative_to_root.parts) == 1:
            continue
        # Ignore certain directories
        if any(part in EXCLUDE for part in path_relative_to_root.parts):
            continue

        doc_readme_path = Path("dev-guide") / "overview" / path_relative_to_root
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
            print(contents, file=f)

        nav[path_relative_to_root.parent.parts] = path_relative_to_root.as_posix()
        mkdocs_gen_files.set_edit_path(doc_readme_path, ".." / path_relative_to_root)
    with mkdocs_gen_files.open("dev-guide/overview/SUMMARY.md", "w") as nav_file:
        nav_file.writelines(nav.build_literate_nav())


if __name__ in ["__main__", "<run_path>"]:
    build_readme_nav()

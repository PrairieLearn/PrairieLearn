"""
This script copies README files into the PrairieLearn documentation.
It processes the README files from specified source directories, modifies links to point
to the corresponding files on GitHub, and creates a navigation structure for the documentation.
"""

import re
from pathlib import Path
from types import SimpleNamespace

import mkdocs_gen_files
from pathspec import RegexPattern

ROOT = Path.cwd()
SOURCE_ROOT = "https://github.com/PrairieLearn/PrairieLearn/blob/master/"

# Any links need to be replaced with a link to the file on GitHub
relative_regex = r"[^!]\[(.*?)\]\((\..*?)\)"
relative_regex_dir = r"[^!]\[(.*?)\]\((\..*?\/)\)"
relative_regex_img = r"!\[(.*?)\]\((\..*?)\)"
readmes_mapping = [
    SimpleNamespace(**v) for v in mkdocs_gen_files.config.extra["additional_readmes"]
]
doc_site_url = mkdocs_gen_files.config.site_url + "/en/latest/"


def build_readme_nav() -> None:
    """Copy all relevant README files into the documentation and create a navigation structure."""
    for mapping in readmes_mapping:
        nav = mkdocs_gen_files.Nav()  # pyright:ignore[reportPrivateImportUsage]
        base = Path(mapping.src).absolute()
        doc_path = Path(mapping.dest)
        title_lookup = {}
        for path in base.rglob("*.md"):
            path_relative_to_base = path.relative_to(base)
            path_relative_to_root = path.relative_to(ROOT)

            doc_readme_path = doc_path / path_relative_to_base
            with mkdocs_gen_files.open(doc_readme_path, "w") as f:
                contents = path.read_text()
                # Rewrite links to directories that point to a README file.
                dir_matches = re.findall(relative_regex_dir, contents)
                for [label, match] in dir_matches:
                    readme_path = path.parent / match / "README.md"
                    if readme_path.exists():
                        contents = contents.replace(
                            f"[{label}]({match})",
                            f"[{label}]({match + 'README.md'})",
                        )

                # Rewrite links to images and files to point to the GitHub repository
                # and add a "raw=true" query parameter to the image links.
                img_matches = re.findall(relative_regex_img, contents)
                for [label, match] in img_matches:
                    # If this is a image within current directory, we can write the image to the directory
                    # and link to it. Otherwise, we need to link to the GitHub repository.
                    img_path = doc_readme_path.parent / match
                    if match.startswith("./"):
                        with (
                            open(path.parent / match, "rb") as img_file_in,
                            mkdocs_gen_files.open(img_path, "wb") as img_file,
                        ):
                            img_file.write(img_file_in.read())
                    else:
                        contents = contents.replace(
                            f"![{label}]({match})",
                            f"![{label}]({SOURCE_ROOT}{path_relative_to_root.parent}/{match}?raw=true)",
                        )

                file_matches = re.findall(relative_regex, contents)
                for [label, match] in file_matches:
                    # Rewrite links that don't point to internal documentation if we can
                    if not match.startswith("./"):
                        # This isn't fully accurate for determining if it's an internal link, but it works for our purposes
                        contents = contents.replace(
                            f"[{label}]({match})",
                            f'[{label}]({SOURCE_ROOT}{path_relative_to_root.parent}/{match} "External link")',
                        )

                header, body = contents.split("\n", 1)
                header_text = header.split("#")[-1].strip()
                print(header, file=f)
                print(
                    f"""!!! note\n\tThis documentation was sourced from [{path_relative_to_root.as_posix()}]({SOURCE_ROOT}{path_relative_to_root.as_posix()}).""".strip(),
                    file=f,
                )
                print(body, file=f)

            if path_relative_to_base.parent.as_posix() == ".":
                continue

            # We only want to add the README.md files to the navigation
            if path.name != "README.md":
                mkdocs_gen_files.config.not_in_nav.patterns.append(
                    RegexPattern(doc_readme_path.as_posix(), include=None)
                )
                continue

            # Note: this code is a bit of a hack to get the title of the parent directory
            # to show up in the navigation. It relies on the fact that the parent directory is traversed before child directories.
            title_lookup[path_relative_to_base.parent.parts] = header_text
            directory = path_relative_to_base.parent
            parent_directory_parts = directory.parent.parts
            nav_title = (
                *tuple(
                    title_lookup.get(
                        parent_directory_parts[: i + 1], parent_directory_parts[i]
                    )
                    for i in range(len(parent_directory_parts))
                ),
                header_text,
            )
            nav[nav_title] = path_relative_to_base.as_posix()
            mkdocs_gen_files.set_edit_path(
                doc_readme_path, ".." / path_relative_to_root
            )
        nav_lines = list(nav.build_literate_nav())
        if len(nav_lines) > 0:
            with mkdocs_gen_files.open(doc_path / "SUMMARY.md", "w") as nav_file:
                nav_file.writelines(nav_lines)


if __name__ in ["__main__", "<run_path>"]:
    build_readme_nav()

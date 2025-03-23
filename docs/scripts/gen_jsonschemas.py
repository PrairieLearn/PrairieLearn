import json
from pathlib import Path

import jsonschema2md
import mkdocs_gen_files

SCHEMAS_ROOT = Path("apps") / "prairielearn" / "src" / "schemas" / "schemas"
URL_ROOT = Path("schemas")  # Relative to the docs directory
SOURCE_ROOT = mkdocs_gen_files.config.repo_url + "/blob/master/"


def build_and_write_schemas() -> None:
    parser = jsonschema2md.Parser(
        header_level=0, collapse_children=True, ignore_patterns=[".*comment.*"]
    )

    for path in sorted(SCHEMAS_ROOT.glob("*.json")):
        file_path = path.relative_to(SCHEMAS_ROOT).with_suffix("")
        full_doc_path = Path("schemas") / file_path.with_suffix(".md")
        source_doc_path = Path("docs") / full_doc_path

        # If the file already exists, skip it
        if not source_doc_path.exists():
            # Create the directory if it doesn't exist
            full_doc_path.parent.mkdir(parents=True, exist_ok=True)
            # Write the documentation file
            with (
                mkdocs_gen_files.open(full_doc_path, "w") as f_out,
                path.open("r") as f,
            ):
                # Parse the JSON schema and write to the file
                contents = parser.parse_schema(json.load(f))
                search_rank_down = """
---
search:
  boost: 0.3
---
""".lstrip()
                header, *body = contents

                f_out.write(search_rank_down)
                f_out.write(header)
                f_out.write(f"> **Source:** [{path.name}]({SOURCE_ROOT}{path})\n\n")
                f_out.writelines(body)


if __name__ in ["__main__", "<run_path>"]:
    build_and_write_schemas()

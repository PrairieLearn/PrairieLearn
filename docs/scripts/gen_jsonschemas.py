import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import jsonschema2md
import mkdocs_gen_files

SCHEMAS_ROOT = Path("apps") / "prairielearn" / "src" / "schemas" / "schemas"
SOURCE_ROOT = mkdocs_gen_files.config.repo_url + "/blob/master/"


def build_and_write_schemas() -> None:
    """
    Generate Markdown documentation from JSON schema files.

    This function scans for JSON schema files in SCHEMAS_ROOT, parses them using
    jsonschema2md, and writes corresponding Markdown documentation files.
    Files that already exist will be skipped.
    """

    class CustomParser(jsonschema2md.Parser):
        """Custom parser that hides [Test](...) links and 'additionalFields: true' in the schema documentation."""

        def _construct_description_line(
            self, *args: Any, **kwargs: Any
        ) -> Sequence[str]:
            """Override to hide the [Test](...) links  and 'additionalFields: true' in the description line."""
            result = super()._construct_description_line(*args, **kwargs)
            result = [re.sub(r" \(\[Test\]\((.*?)\)\)", "", line) for line in result]
            result = [
                line.replace("Can contain additional properties.", "")
                for line in result
            ]
            return result

    parser = CustomParser(
        header_level=0, collapse_children=True, ignore_patterns=[".*comment.*"]
    )

    for path in sorted(SCHEMAS_ROOT.glob("*.json")):
        file_path = path.relative_to(SCHEMAS_ROOT).with_suffix("")
        full_doc_path = Path("schemas") / file_path.with_suffix(".md")

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

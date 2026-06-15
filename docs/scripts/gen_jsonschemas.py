import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import jsonschema2md
import mkdocs_gen_files

SCHEMAS_ROOT = Path("apps") / "prairielearn" / "src" / "schemas" / "schemas"
SOURCE_ROOT = mkdocs_gen_files.config.repo_url + "/blob/master/"

MAX_SAFE_INT = 9007199254740991
SCALAR_TYPES = frozenset({"string", "number", "integer", "boolean", "null"})


def _collapse_scalar_union(obj: dict[str, Any]) -> dict[str, Any]:
    """Render a union of bare scalar ``{type: X}`` branches as the compact
    ``type: [X, ...]`` form. Zod 4 emits every union (including nullables) as
    ``anyOf``, which jsonschema2md would otherwise expand into a verbose nested
    list instead of an inline "string or null".

    If the following issue is ever addressed, drop this manual adjustment:
    https://github.com/colinhacks/zod/issues/6047
    """
    for keyword in ("anyOf", "oneOf"):
        branches = obj.get(keyword)
        if (
            isinstance(branches, list)
            and len(branches) >= 2
            and "type" not in obj
            and all(
                isinstance(b, dict) and set(b) == {"type"} and b["type"] in SCALAR_TYPES
                for b in branches
            )
        ):
            return {
                **{k: v for k, v in obj.items() if k != keyword},
                "type": [b["type"] for b in branches],
            }
    return obj


def _strip_safe_integer_bounds(obj: dict[str, Any]) -> dict[str, Any]:
    """Drop the JS safe-integer sentinel bounds Zod 4 stamps on every unbounded
    integer; rendering "Maximum: 9007199254740991" on each one reads as noise.
    Real ``.min()`` / ``.max()`` constraints use other values and are kept.
    """
    if obj.get("minimum") == -MAX_SAFE_INT or obj.get("maximum") == MAX_SAFE_INT:
        obj = dict(obj)
        if obj.get("minimum") == -MAX_SAFE_INT:
            del obj["minimum"]
        if obj.get("maximum") == MAX_SAFE_INT:
            del obj["maximum"]
    return obj


def build_and_write_schemas() -> None:
    """
    Generate Markdown documentation from JSON schema files.

    This function scans for JSON schema files in SCHEMAS_ROOT, parses them using
    jsonschema2md, and writes corresponding Markdown documentation files.
    Files that already exist will be skipped.
    """

    class CustomParser(jsonschema2md.Parser):
        """Custom parser that renders the raw Zod 4 output sensibly: it hides
        [Test](...) links and 'additional properties' notes, collapses scalar
        anyOf/oneOf unions into the inline `type: [...]` form, and drops the
        safe-integer sentinel bounds Zod 4 stamps on every integer.
        """

        def _parse_object(self, obj: Any, *args: Any, **kwargs: Any) -> list[str]:
            """Collapse scalar unions before the base parser expands them into a list."""
            if isinstance(obj, dict):
                obj = _collapse_scalar_union(obj)
            return super()._parse_object(obj, *args, **kwargs)

        def _construct_description_line(
            self, obj: Any, *args: Any, **kwargs: Any
        ) -> Sequence[str]:
            """Override to hide the [Test](...) links, 'additional properties' notes,
            and the safe-integer sentinel bounds in the description line.
            """
            if isinstance(obj, dict):
                obj = _strip_safe_integer_bounds(obj)
            result = super()._construct_description_line(obj, *args, **kwargs)
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

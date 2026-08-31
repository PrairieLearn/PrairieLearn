from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest
from helpers import SmokeTestSuite

HERE = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "pl_big_operator_input_readme", HERE / "pl-big-operator-input.py"
)
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)

README_EXAMPLES = re.findall(
    r"^```(?:html|xml)\s*\n(.*?)^```\s*$",
    (HERE / "README.md").read_text(),
    flags=re.MULTILINE | re.DOTALL,
)


class TestReadmeExamples(SmokeTestSuite):
    def test_readme_contains_markup_examples(self):
        assert README_EXAMPLES

    @pytest.mark.parametrize("example", README_EXAMPLES)
    def test_readme_markup_examples_validate_prepare_and_render(self, example):
        elements = [
            fragment
            for fragment in mod.lxml.html.fragments_fromstring(example)
            if getattr(fragment, "tag", None) == "pl-big-operator-input"
        ]
        assert len(elements) == 1
        markup = mod.lxml.html.tostring(elements[0], encoding="unicode")
        data = {
            "params": {},
            "correct_answers": {},
            "raw_submitted_answers": {},
            "panel": "question",
        }

        mod.pl.validate_element(
            elements[0],
            HERE / "pl-big-operator-input.schema.json",
        )
        mod.prepare(markup, data)

        assert mod.render(markup, data)

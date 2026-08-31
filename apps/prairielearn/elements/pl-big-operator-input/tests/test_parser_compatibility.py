from __future__ import annotations

from pathlib import Path

import pytest
import sympy
import test_pl_big_operator_input as suite
from helpers import RegressionTestSuite, UnitTestSuite

mod = suite.mod


class TestParserRegressions(RegressionTestSuite):
    @pytest.mark.parametrize("token", ["k+1", "1", "a.b", "__import__", "'k'"])
    def test_wrapper_index_is_lexically_validated(self, token: str):
        assert mod._identifier(token) is None

    def test_project_owned_code_has_no_direct_sympy_parse_calls(self):
        root = Path(__file__).resolve().parents[3]
        offenders = []
        for path in root.rglob("*.py"):
            if "vendor" in path.parts:
                continue
            source = path.read_text()
            if "sympy." + "parse" in source:
                offenders.append(str(path.relative_to(root)))
        assert offenders == []

    def test_partial_canonical_submission_falls_back_for_render_and_grades_zero(self):
        markup = suite.html(operator="sum", **{"correct-answer": "Sum(k, (k, 1, 2))"})
        state = suite.data(panel="submission")
        mod.prepare(markup, state)
        state["submitted_answers"] = {"op": {}}

        assert mod.render(markup, state)
        mod.grade(markup, state)

        assert state["partial_scores"]["op"] == {"score": 0.0, "weight": 1}

    def test_malformed_correct_answer_container_has_descriptive_error(self):
        state = suite.data()
        state["correct_answers"] = None
        with pytest.raises(TypeError, match="mapping"):
            mod.prepare(suite.html(operator="sum"), state)


class TestParserUnits(UnitTestSuite):
    @pytest.mark.parametrize(
        "value",
        [
            sympy.Symbol("x"),
            sympy.Integer(2) * sympy.Symbol("x") + 1,  # type: ignore
            sympy.FiniteSet(1, 2),
            sympy.Interval(0, 1),
        ],
    )
    def test_public_sympy_json_round_trip(self, value: sympy.Basic):
        assert mod._decode(mod._json(value), ("x",)) == value

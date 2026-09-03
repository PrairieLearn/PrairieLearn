from __future__ import annotations

import importlib
from typing import Any, Literal

import prairielearn as pl
import pytest
import sympy

big_operator_input = importlib.import_module("pl-big-operator-input")


def html(**attributes: object) -> str:
    values = {"answers-name": "op", "index-variable": "k", **attributes}
    serialized = " ".join(
        f'{name}="{value}"' for name, value in values.items() if value is not None
    )
    return f"<pl-big-operator-input {serialized}></pl-big-operator-input>"


def question_data(
    correct_answer: object | None = None,
    raw_submitted_answers: dict[str, str] | None = None,
    panel: Literal["answer", "submission", "question"] = "question",
) -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": ({} if correct_answer is None else {"op": correct_answer}),
        "raw_submitted_answers": raw_submitted_answers or {},
        "panel": panel,
    }


def prepare_parse_grade(markup: str, data: dict[str, Any]) -> None:
    big_operator_input.prepare(markup, data)
    big_operator_input.parse(markup, data)
    big_operator_input.grade(markup, data)


class TestConfigurationUnits:
    @pytest.mark.parametrize(
        ("operator", "limits"),
        [
            ("sum", "bounds"),
            ("product", "bounds"),
            ("integral", "bounds"),
            ("limit", "approach"),
            ("union", "domain"),
            ("intersection", "domain"),
            ("disjoint-union", "domain"),
            ("min", "domain"),
            ("max", "domain"),
        ],
    )
    def test_default_limit_format(self, operator: str, limits: str) -> None:
        assert big_operator_input._config(html(operator=operator)).limits == limits

    @pytest.mark.parametrize(
        ("operator", "limits"),
        [
            ("sum", "bounds"),
            ("sum", "domain"),
            ("integral", "bounds"),
            ("integral", "domain"),
            ("union", "bounds"),
            ("union", "domain"),
            ("min", "bounds"),
            ("min", "domain"),
            ("limit", "approach"),
        ],
    )
    def test_supported_limit_formats(self, operator: str, limits: str) -> None:
        assert (
            big_operator_input._config(html(operator=operator, limits=limits)).limits
            == limits
        )

    @pytest.mark.parametrize(
        ("operator", "limits"),
        [
            ("sum", "approach"),
            ("integral", "approach"),
            ("limit", "bounds"),
            ("limit", "domain"),
        ],
    )
    def test_unsupported_limit_formats(self, operator: str, limits: str) -> None:
        with pytest.raises(ValueError, match="does not support"):
            big_operator_input._config(html(operator=operator, limits=limits))

    @pytest.mark.parametrize(
        "operator",
        [
            "Sum",
            "Product",
            "Integral",
            "Limit",
            "Union",
            "Intersection",
            "Disjoint-union",
            "Min",
            "Max",
        ],
    )
    def test_operator_accepts_initial_capital(self, operator: str) -> None:
        config = big_operator_input._config(html(operator=operator))

        assert config.operator == operator[:1].lower() + operator[1:]

    @pytest.mark.parametrize("operator", ["SUM", "and", "Or"])
    def test_unknown_operator_is_rejected(self, operator: str) -> None:
        with pytest.raises(ValueError, match="Unknown operator"):
            big_operator_input._config(html(operator=operator))

    def test_custom_operator_requires_limits_and_latex(self) -> None:
        with pytest.raises(ValueError, match="explicit limits"):
            big_operator_input._config(
                html(operator="custom", **{"operator-latex": r"\star"})
            )

        with pytest.raises(ValueError, match="required"):
            big_operator_input._config(html(operator="custom", limits="bounds"))

        config = big_operator_input._config(
            html(
                operator="Custom",
                limits="bounds",
                **{"operator-latex": r"\mathbb{E}"},
            )
        )
        assert config.operator == "custom"
        assert config.operator_latex == r"\mathbb{E}"

    def test_direction_input_only_applies_to_limits(self) -> None:
        assert big_operator_input._config(html(operator="limit")).allow_direction_input

        fixed = big_operator_input._config(
            html(
                operator="limit",
                **{
                    "limit-direction": "from-left",
                    "allow-limit-direction-input": "false",
                },
            )
        )
        assert not fixed.allow_direction_input
        assert fixed.direction == "from-left"

        with pytest.raises(ValueError, match="can only be used"):
            big_operator_input._config(
                html(operator="sum", **{"allow-limit-direction-input": "false"})
            )

    @pytest.mark.parametrize("allowed_blank", ["none", "limits", "body", "all"])
    def test_allowed_blank_values(self, allowed_blank: str) -> None:
        config = big_operator_input._config(
            html(operator="sum", **{"allowed-blank": allowed_blank})
        )

        assert config.allowed_blank == allowed_blank


class TestPrepareUnits:
    @pytest.mark.parametrize(
        ("correct_answer", "operator", "limits", "index"),
        [
            ("Sum(k**2, (k, 1, 4))", "sum", "bounds", "k"),
            ("Product(k, (k, 1, 4))", "product", "bounds", "k"),
            ("Integral(k, (k, 0, 1))", "integral", "bounds", "k"),
            ("Integral(z, (z, Gamma))", "integral", "domain", "z"),
            ("Limit(sin(x) / x, (x, 0, '+'))", "limit", "approach", "x"),
            ("Union({k}, (k, {1, 2}))", "union", "domain", "k"),
            (
                "Intersection({k}, (k, {1, 2}))",
                "intersection",
                "domain",
                "k",
            ),
            (
                "DisjointUnion({k}, (k, {1, 2}))",
                "disjoint-union",
                "domain",
                "k",
            ),
            ("Min(k**2, (k, {1, 2}))", "min", "domain", "k"),
            ("Max(k**2, (k, {1, 2}))", "max", "domain", "k"),
        ],
    )
    def test_whole_answer_infers_configuration(
        self, correct_answer: str, operator: str, limits: str, index: str
    ) -> None:
        markup = html(**{
            "correct-answer": correct_answer,
            "index-variable": None,
            "variables": "Gamma",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = data["correct_answers"]["op"]
        config = big_operator_input._config(markup, data)
        assert answer["operator"] == operator
        assert answer["limits"] == limits
        assert config.operator == operator
        assert config.limits == limits
        assert config.index == index

    @pytest.mark.parametrize(
        ("direction", "expected"),
        [("+", "from-right"), ("-", "from-left"), ("+-", "two-sided")],
    )
    def test_limit_direction_is_normalized(self, direction: str, expected: str) -> None:
        markup = html(**{
            "correct-answer": f"Limit(k, (k, 0, '{direction}'))",
            "limit-direction": expected,
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        assert data["correct_answers"]["op"]["direction"] == expected

    @pytest.mark.parametrize(
        ("correct_answer", "operator"),
        [
            (sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4)), "sum"),
            (sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4)), "product"),
            (sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1)), "integral"),
        ],
    )
    def test_sympy_answers_are_normalized(
        self, correct_answer: sympy.Basic, operator: str
    ) -> None:
        data = question_data(correct_answer)

        big_operator_input.prepare(html(operator=operator), data)

        answer = data["correct_answers"]["op"]
        decoded = pl.decode_operator_expression(answer)
        assert answer["_type"] == "operator_expression"
        assert answer["operator"] == operator
        assert decoded["body"] == correct_answer.args[0]
        assert data["params"] == {}

    def test_custom_operator_is_inferred_from_operator_latex(self) -> None:
        markup = html(**{
            "correct-answer": "Custom(k**2, (k, 1, 4))",
            "operator-latex": r"\mathbb{E}",
            "grading-method": "exact",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = data["correct_answers"]["op"]
        assert answer["operator"] == "custom"
        assert answer["operator_latex"] == r"\mathbb{E}"

    @pytest.mark.parametrize(
        ("correct_answer", "component"),
        [
            ("Union(k + 1, (k, {1, 2}))", "body"),
            ("Union({k}, (k, 1))", "domain"),
        ],
    )
    def test_set_operator_requires_set_components(
        self, correct_answer: str, component: str
    ) -> None:
        with pytest.raises(ValueError, match=rf'component "{component}" must be a set'):
            big_operator_input.prepare(
                html(operator="union", **{"correct-answer": correct_answer}),
                question_data(),
            )

    def test_explicit_configuration_must_match_whole_answer(self) -> None:
        with pytest.raises(TypeError, match="matching formatted object"):
            big_operator_input.prepare(
                html(operator="sum"),
                question_data("Product(k, (k, 1, 4))"),
            )


class TestParseUnits:
    @pytest.mark.parametrize(
        ("operator", "limits", "raw", "expected_components"),
        [
            (
                "sum",
                "bounds",
                {"op-start": "1", "op-end": "4", "op-body": "k^2"},
                {"lower", "upper", "body"},
            ),
            (
                "union",
                "domain",
                {"op-domain": "{1, 2}", "op-body": "{k}"},
                {"domain", "body"},
            ),
            (
                "limit",
                "approach",
                {
                    "op-target": "0",
                    "op-body": "sin(k)/k",
                    "op-direction": "from-right",
                },
                {"target", "body", "direction"},
            ),
        ],
    )
    def test_visible_fields_parse_to_one_canonical_answer(
        self,
        operator: str,
        limits: str,
        raw: dict[str, str],
        expected_components: set[str],
    ) -> None:
        data = question_data(raw_submitted_answers={**raw, "op-unused": "99"})

        big_operator_input.parse(html(operator=operator, limits=limits), data)

        answer = data["submitted_answers"]["op"]
        assert answer["_type"] == "operator_expression"
        assert answer["operator"] == operator
        assert answer["limits"] == limits
        assert expected_components <= answer.keys()
        assert set(data["submitted_answers"]) == {"op"}
        assert not data.get("format_errors")

    @pytest.mark.parametrize(
        ("operator", "field"),
        [
            ("sum", "op-domain"),
            ("union", "op-domain"),
            ("union", "op-body"),
        ],
    )
    def test_set_fields_reject_non_sets(self, operator: str, field: str) -> None:
        raw = {"op-domain": "1", "op-body": "{k}"}
        if field == "op-body":
            raw = {"op-domain": "{1, 2}", "op-body": "k + 1"}
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(html(operator=operator, limits="domain"), data)

        assert data["submitted_answers"]["op"] is None
        assert data["format_errors"][field] == "This field must be a set."

    @pytest.mark.parametrize(
        ("allowed_blank", "raw"),
        [
            ("limits", {"op-start": "", "op-end": "2", "op-body": "k"}),
            ("body", {"op-start": "1", "op-end": "2", "op-body": ""}),
            ("all", {"op-start": "", "op-end": "", "op-body": ""}),
        ],
    )
    def test_configured_blank_fields_are_accepted(
        self, allowed_blank: str, raw: dict[str, str]
    ) -> None:
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(
            html(operator="sum", **{"allowed-blank": allowed_blank}), data
        )

        assert data["submitted_answers"]["op"] == ""
        assert not data.get("format_errors")

    def test_blank_required_fields_have_field_errors(self) -> None:
        data = question_data(
            raw_submitted_answers={"op-start": "", "op-end": "", "op-body": ""}
        )

        big_operator_input.parse(html(operator="sum"), data)

        assert data["submitted_answers"]["op"] is None
        assert set(data["format_errors"]) == {"op-start", "op-end", "op-body"}

    def test_custom_functions_are_available_in_the_body(self) -> None:
        markup = html(
            operator="sum",
            **{"custom-functions": "f", "variables": "x"},
        )
        data = question_data(
            raw_submitted_answers={
                "op-start": "1",
                "op-end": "2",
                "op-body": "f(k) + x",
            }
        )

        big_operator_input.parse(markup, data)

        decoded = pl.decode_operator_expression(data["submitted_answers"]["op"])
        assert decoded["body"] == sympy.Function("f")(sympy.Symbol("k")) + sympy.Symbol(
            "x"
        )


class TestGradeUnits:
    @pytest.mark.parametrize("grading_method", ["exact", "equivalent"])
    def test_whole_answer_grading(self, grading_method: str) -> None:
        markup = html(
            operator="sum",
            **{
                "correct-answer": "Sum(k**2, (k, 1, 4))",
                "grading-method": grading_method,
            },
        )
        data = question_data(
            raw_submitted_answers={
                "op-start": "1",
                "op-end": "4",
                "op-body": "k^2",
            }
        )

        prepare_parse_grade(markup, data)

        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}

    def test_component_grading_uses_equivalence_and_body_weight(self) -> None:
        markup = html(
            operator="sum",
            **{
                "correct-answer": "Sum(2*k, (k, 2, 4))",
                "grading-method": "component",
                "body-relative-weight": "2",
            },
        )
        data = question_data(
            raw_submitted_answers={
                "op-start": "1 + 1",
                "op-end": "5",
                "op-body": "k + k",
            }
        )

        prepare_parse_grade(markup, data)

        assert data["partial_scores"]["op"]["score"] == pytest.approx(0.75)

    @pytest.mark.parametrize(
        ("submitted_direction", "expected_score"),
        [("from-right", 1.0), ("from-left", 0.0)],
    )
    def test_student_limit_direction_is_graded(
        self, submitted_direction: str, expected_score: float
    ) -> None:
        markup = html(
            operator="limit",
            **{
                "correct-answer": "Limit(1/k, (k, 0, '+'))",
                "grading-method": "component",
            },
        )
        data = question_data(
            raw_submitted_answers={
                "op-target": "0",
                "op-body": "1/k",
                "op-direction": submitted_direction,
            }
        )

        prepare_parse_grade(markup, data)

        scores = big_operator_input._component_scores(
            big_operator_input._config(markup, data), data
        )
        assert scores["direction"] == expected_score

    def test_element_test_submission_round_trips(self) -> None:
        markup = html(operator="sum", **{"correct-answer": "Sum(k**2, (k, 1, 4))"})
        data = question_data()
        big_operator_input.prepare(markup, data)
        data.update(
            test_type="correct",
            raw_submitted_answers={},
            partial_scores={},
            format_errors={},
        )

        big_operator_input.test(markup, data)
        big_operator_input.parse(markup, data)
        big_operator_input.grade(markup, data)

        assert data["raw_submitted_answers"] == {
            "op-start": "1",
            "op-end": "4",
            "op-body": "k**2",
        }
        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


class TestRenderUnits:
    @pytest.mark.parametrize(
        ("operator", "limits", "present", "absent"),
        [
            ("sum", "bounds", ("op-start", "op-end", "op-body"), ("op-domain",)),
            ("union", "domain", ("op-domain", "op-body"), ("op-start", "op-end")),
            (
                "limit",
                "approach",
                ("op-target", "op-direction", "op-body"),
                ("op-start", "op-domain"),
            ),
        ],
    )
    def test_question_panel_renders_fields_for_limit_format(
        self,
        operator: str,
        limits: str,
        present: tuple[str, ...],
        absent: tuple[str, ...],
    ) -> None:
        rendered = big_operator_input.render(
            html(operator=operator, limits=limits), question_data()
        )

        for field in present:
            assert f'name="{field}"' in rendered
        for field in absent:
            assert f'name="{field}"' not in rendered

    @pytest.mark.parametrize(
        ("correct_answer", "expected_tex"),
        [
            ("Sum(k**2, (k, 1, 4))", r"\sum_{k=1}^{4} k^{2}"),
            ("Integral(k, (k, 0, 1))", r"\int_{0}^{1} k\,\mathrm{d}k"),
            (
                "Union({k}, (k, {1, 2}))",
                r"\bigcup_{k\in \left\{1, 2\right\}} \left\{k\right\}",
            ),
            ("Limit(1/k, (k, 0, '+'))", r"\lim_{k\to 0^+} \frac{1}{k}"),
        ],
    )
    def test_answer_panel_renders_complete_notation(
        self, correct_answer: str, expected_tex: str
    ) -> None:
        markup = html(**{"correct-answer": correct_answer})
        data = question_data(panel="answer")
        big_operator_input.prepare(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert expected_tex in rendered
        assert "badge" not in rendered

    def test_component_grading_renders_per_field_feedback(self) -> None:
        markup = html(
            operator="sum",
            **{
                "correct-answer": "Sum(k**2, (k, 1, 4))",
                "grading-method": "component",
            },
        )
        data = question_data(
            raw_submitted_answers={
                "op-start": "1",
                "op-end": "5",
                "op-body": "k^2",
            }
        )
        prepare_parse_grade(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert rendered.count("fa-check") == 2
        assert rendered.count("fa-times") == 1


class TestCorrectAnswerRegressions:
    def test_structured_answer_rejects_disallowed_complex_value(self) -> None:
        config = big_operator_input._config(html(operator="sum"))
        answer = big_operator_input._canonical(
            config,
            {
                "lower": sympy.Integer(1),
                "upper": sympy.Integer(2),
                "body": sympy.I,
            },
        )

        with pytest.raises(ValueError, match="complex"):
            big_operator_input.prepare(
                html(operator="sum", **{"allow-complex": "false"}),
                question_data(answer),
            )

    def test_structured_answer_rejects_undeclared_symbol(self) -> None:
        config = big_operator_input._config(html(operator="sum"))
        answer = big_operator_input._canonical(
            config,
            {
                "lower": sympy.Integer(1),
                "upper": sympy.Integer(2),
                "body": sympy.Symbol("undeclared"),
            },
        )

        with pytest.raises(ValueError, match="undeclared"):
            big_operator_input.prepare(html(operator="sum"), question_data(answer))

    def test_symbol_named_like_sympy_function_renders_as_symbol(self) -> None:
        markup = html(**{
            "index-variable": None,
            "correct-answer": "Sum(k**-2, (k, N))",
            "variables": "N",
            "grading-method": "exact",
        })
        data = question_data(
            raw_submitted_answers={"op-domain": "N", "op-body": "k^-2"},
            panel="answer",
        )
        prepare_parse_grade(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert r"\sum_{k\in N} \frac{1}{k^{2}}" in rendered
        assert "&lt;function N at" not in rendered


class TestLifecycleRegressions:
    def test_valid_reparse_clears_stale_format_error(self) -> None:
        markup = html(operator="sum")
        data = question_data(
            raw_submitted_answers={
                "op-start": "bad@",
                "op-end": "2",
                "op-body": "k",
            }
        )
        big_operator_input.parse(markup, data)
        assert "op-start" in data["format_errors"]

        data["raw_submitted_answers"]["op-start"] = "1"
        big_operator_input.parse(markup, data)

        assert "op-start" not in data["format_errors"]
        assert data["submitted_answers"]["op"] is not None

    def test_invalid_reparse_replaces_previous_score_with_zero(self) -> None:
        markup = html(operator="sum", **{"correct-answer": "Sum(k, (k, 1, 2))"})
        data = question_data(
            raw_submitted_answers={
                "op-start": "1",
                "op-end": "2",
                "op-body": "k",
            }
        )
        prepare_parse_grade(markup, data)
        assert data["partial_scores"]["op"]["score"] == 1

        data["raw_submitted_answers"]["op-body"] = "bad@"
        big_operator_input.parse(markup, data)
        big_operator_input.grade(markup, data)

        assert data["partial_scores"]["op"] == {"score": 0.0, "weight": 1}

    def test_equivalent_component_uses_correct_score_badge(self) -> None:
        markup = html(
            operator="sum",
            **{
                "grading-method": "component",
                "correct-answer": "Sum((k+1)^2, (k, 1, 2))",
            },
        )
        data = question_data(
            raw_submitted_answers={
                "op-start": "1",
                "op-end": "2",
                "op-body": "k^2+2*k+1",
            }
        )

        prepare_parse_grade(markup, data)

        scores = big_operator_input._component_scores(
            big_operator_input._config(markup, data), data
        )
        assert data["partial_scores"]["op"]["score"] == 1
        assert scores["body"] == 1

    def test_partial_submission_renders_and_grades_zero(self) -> None:
        markup = html(operator="sum", **{"correct-answer": "Sum(k, (k, 1, 2))"})
        data = question_data(panel="submission")
        big_operator_input.prepare(markup, data)
        data["submitted_answers"] = {"op": {}}

        assert big_operator_input.render(markup, data)
        big_operator_input.grade(markup, data)

        assert data["partial_scores"]["op"] == {"score": 0.0, "weight": 1}

    def test_structural_equivalence_does_not_evaluate_sum(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        k = sympy.Symbol("k")
        expanded_body = sympy.expand((k + 1) ** 8)
        submitted = sympy.Sum(expanded_body, (k, 1, 100))
        correct = sympy.Sum((k + 1) ** 8, (k, 1, 100))

        def unexpected_doit(self: sympy.Sum, **hints: Any) -> sympy.Basic:
            raise AssertionError("equivalence should be established before evaluation")

        monkeypatch.setattr(sympy.Sum, "doit", unexpected_doit)

        assert big_operator_input._expressions_equivalent(submitted, correct)

    @pytest.mark.parametrize("token", ["k+1", "1", "a.b", "__import__", "'k'"])
    def test_wrapper_index_is_lexically_validated(self, token: str) -> None:
        assert big_operator_input._identifier(token) is None

from __future__ import annotations

import importlib
import re
import time
from dataclasses import replace
from typing import Any, Literal, cast, get_args

import lxml.html
import prairielearn as pl
import prairielearn.big_operator_utils as pbo
import prairielearn.sympy_utils as psu
import pytest
import sympy

big_operator_input = importlib.import_module("pl-big-operator-input")


def inferred_answer(operator: str, indexing: str | None = None) -> str:
    if operator == "Limit":
        return "Limit(k, (k, 0, '+-'))"
    body = "{k}" if operator in {"Union", "Intersection", "DisjointUnion"} else "k"
    if indexing == "domain" or (
        indexing is None
        and operator in {"Union", "Intersection", "DisjointUnion", "Min", "Max"}
    ):
        return f"{operator}({body}, (k, {{1, 2}}))"
    return f"{operator}({body}, (k, 1, 2))"


def html(**attributes: object) -> str:
    operator = attributes.pop("operator", None)
    indexing = attributes.pop("indexing", None)
    if operator is not None and "correct-answer" not in attributes:
        attributes["correct-answer"] = inferred_answer(
            str(operator), None if indexing is None else str(indexing)
        )
    values = {
        "answers-name": "op",
        **attributes,
    }
    serialized = " ".join(
        f'{name}="{value}"' for name, value in values.items() if value is not None
    )
    return f"<pl-big-operator-input {serialized}></pl-big-operator-input>"


def question_data(
    correct_answer: object | None = None,
    raw_submitted_answers: dict[str, str] | None = None,
    panel: Literal["answer", "submission", "question"] = "question",
) -> dict[str, Any]:
    raw_submitted_answers = raw_submitted_answers or {}
    return {
        "params": {},
        "preferences": {},
        "correct_answers": ({} if correct_answer is None else {"op": correct_answer}),
        "answers_names": {},
        "submitted_answers": dict(raw_submitted_answers),
        "raw_submitted_answers": raw_submitted_answers,
        "format_errors": {},
        "partial_scores": {},
        "panel": panel,
        "editable": panel == "question",
    }


def prepare_parse_grade(markup: str, data: dict[str, Any]) -> None:
    big_operator_input.prepare(markup, data)
    big_operator_input.parse(markup, data)
    big_operator_input.grade(markup, data)


class TestConfigurationUnits:
    def test_sympy_operator_metadata_is_complete(self) -> None:
        assert set(big_operator_input.OP_METADATA) == set(
            get_args(pbo.BigOperatorSympyName.__value__)
        )

    def test_correct_answer_is_required(self) -> None:
        with pytest.raises(ValueError, match="is required"):
            big_operator_input._config(html())

    def test_custom_operator_requires_latex(self) -> None:
        with pytest.raises(ValueError, match='"operator-latex" is required'):
            big_operator_input._config(
                html(**{"correct-answer": "Custom(k, (k, 1, 2))"})
            )

    def test_direction_input_only_applies_to_limits(self) -> None:
        assert big_operator_input._config(html(operator="Limit")).allow_direction_input

        fixed = big_operator_input._config(
            html(operator="Limit", **{"allow-approach-direction-input": "false"})
        )
        assert not fixed.allow_direction_input
        assert fixed.direction == "two-sided"

        with pytest.raises(ValueError, match="can only be used"):
            big_operator_input._config(
                html(operator="Sum", **{"allow-approach-direction-input": "false"})
            )

    @pytest.mark.parametrize("allowed_blank", ["none", "indices", "body", "all"])
    def test_allowed_blank_values(self, allowed_blank: str) -> None:
        config = big_operator_input._config(
            html(operator="Sum", **{"allowed-blank": allowed_blank})
        )

        assert config.allowed_blank == allowed_blank

    @pytest.mark.parametrize(("imaginary_unit", "expected"), [(None, "i"), ("j", "j")])
    def test_imaginary_unit_for_display(
        self, imaginary_unit: str | None, expected: str
    ) -> None:
        config = big_operator_input._config(
            html(
                operator="Sum",
                **{"imaginary-unit-for-display": imaginary_unit},
            )
        )

        assert config.imaginary_unit == expected

    @pytest.mark.parametrize(
        ("display_log_as_ln", "expected"), [(None, False), ("true", True)]
    )
    def test_display_log_as_ln(
        self, display_log_as_ln: str | None, expected: bool
    ) -> None:
        config = big_operator_input._config(
            html(
                operator="Sum",
                **{"display-log-as-ln": display_log_as_ln},
            )
        )

        assert config.display_log_as_ln is expected

    @pytest.mark.parametrize(
        ("attributes", "correct_answer", "match"),
        [
            ({"body-size": "0"}, None, '"body-size" must be positive'),
            ({"index-field-size": "0"}, None, '"index-field-size" must be positive'),
            ({"grading-method": "invalid"}, None, '"grading-method" must be'),
            (
                {"body-relative-weight": "0"},
                None,
                '"body-relative-weight" must be positive',
            ),
            ({"allowed-blank": "invalid"}, None, '"allowed-blank" must be'),
            (
                {"imaginary-unit-for-display": "k"},
                None,
                '"imaginary-unit-for-display" must be',
            ),
            (
                {"operator-latex": r"\bigstar"},
                "Custom(k, (k, 1, 2))",
                "do not support grading-method",
            ),
        ],
    )
    def test_invalid_configuration_values_are_rejected(
        self,
        attributes: dict[str, str],
        correct_answer: str | None,
        match: str,
    ) -> None:
        markup = html(operator="Sum", **attributes)
        data = question_data(correct_answer)
        if correct_answer is not None:
            markup = html(**attributes)

        with pytest.raises(ValueError, match=match):
            big_operator_input._config(markup, data)

    def test_missing_answer_name_is_rejected(self) -> None:
        with pytest.raises(ValueError, match='"answers-name" missing'):
            big_operator_input._config(
                '<pl-big-operator-input correct-answer="Sum(k, (k, 1, 2))" />'
            )

    def test_correct_answers_must_be_a_mapping(self) -> None:
        with pytest.raises(TypeError, match="must be a mapping"):
            big_operator_input._config(html(), {"correct_answers": []})

    @pytest.mark.parametrize("operator", ["Min", "Max"])
    def test_min_max_reject_bounds_indexing(self, operator: str) -> None:
        with pytest.raises(ValueError, match="does not support"):
            big_operator_input._config(
                html(**{"correct-answer": f"{operator}(k, (k, 1, 2))"})
            )

    def test_inferred_operator_rejects_unsupported_indexing(self) -> None:
        correct_answer = {
            "_type": "big_operator",
            "_version": 1,
            "operator": "Limit",
            "indexing": "bounds",
            "index": psu.sympy_to_json(sympy.Symbol("k")),
            "lower": psu.sympy_to_json(sympy.Integer(1)),
            "upper": psu.sympy_to_json(sympy.Integer(2)),
            "body": psu.sympy_to_json(sympy.Symbol("k")),
        }

        with pytest.raises(ValueError, match="does not support"):
            big_operator_input._config(html(), question_data(correct_answer))

    def test_invalid_inferred_limit_direction_is_rejected(self) -> None:
        correct_answer = pbo.big_operator_to_json(
            operator="Limit",
            indexing="approaches",
            index="k",
            target="0",
            direction="from-right",
            body="1/k",
        )
        correct_answer["direction"] = "sideways"  # type: ignore[typeddict-item]

        with pytest.raises(ValueError, match="valid direction"):
            big_operator_input._config(html(), question_data(correct_answer))


class TestCorrectAnswerParsingUnits:
    def test_low_level_shape_helpers_handle_noncanonical_input(self) -> None:
        k, j = sympy.symbols("k j")
        domain_sum = sympy.Basic.__new__(
            sympy.Sum, k, sympy.Tuple(k, sympy.FiniteSet(1, 2))
        )
        multi_sum = sympy.Sum(k, (k, 1, 2), (j, 1, 2))

        assert big_operator_input._binder_indexing(sympy.Limit(k, k, 0)) == "approaches"
        assert big_operator_input._binder_indexing(domain_sum) == "domain"
        assert big_operator_input._binder_indexing(sympy.Sum(k, (k, 1, 2))) == "bounds"
        assert big_operator_input._binder_indexing(multi_sum) is None
        assert big_operator_input._binder_indexing(k) is None
        assert big_operator_input._binder_index(sympy.Limit(k, k, 0)) == "k"
        assert big_operator_input._binder_index(sympy.Sum(k, (k, 1, 2))) == "k"
        assert big_operator_input._binder_index(multi_sum) is None

    def test_wrapper_helpers_reject_malformed_calls(self) -> None:
        assert big_operator_input._formatted_call("k + 1", "Sum") is None
        assert big_operator_input._formatted_call("Sum(k)", "Sum") is None
        assert big_operator_input._formatted_call("Sum(k, k)", "Sum") is None
        assert big_operator_input._direction_symbol_from_args(("k", "0")) is None
        assert big_operator_input._direction_symbol_from_args(("k", "0", "+")) is None
        assert big_operator_input._parse_sympy_limit_call("k + 1") is None
        assert big_operator_input._parse_sympy_limit_call("Limit(k, k, 0)") is None
        assert (
            big_operator_input._parse_sympy_limit_call("Limit(k, k, 0, dir='sideways')")
            is None
        )
        assert (
            big_operator_input._answer_json(
                big_operator_input._config(html(operator="Sum")), "k + 1"
            )
            is None
        )

    def test_inference_falls_back_for_unformatted_limits(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sympy_json = psu.sympy_to_json(sympy.Limit(sympy.Symbol("k"), "k", 0))

        assert big_operator_input._parse_spec(sympy_json) == (
            "Limit",
            "approaches",
            "k",
        )
        assert big_operator_input._parse_spec(object()) == (None, None, None)
        assert (
            big_operator_input._parse_direction("Limit(k, (k, 0, '?'))", "Limit")
            is None
        )
        assert (
            big_operator_input._parse_direction("Limit(k, (k, 0, unquoted))", "Limit")
            is None
        )
        assert big_operator_input._parse_direction(object(), "Limit") is None

        monkeypatch.setattr(
            big_operator_input,
            "_as_sympy",
            lambda _raw: sympy.Limit(sympy.Symbol("k"), "k", 0),
        )
        assert big_operator_input._parse_direction("not a wrapper", "Limit") == (
            "from-right"
        )

    def test_sympy_to_big_operator_json_normalizes_supported_objects(self) -> None:
        k = sympy.Symbol("k")
        sum_config = big_operator_input._config(html(operator="Sum"))
        product_config = big_operator_input._config(html(operator="Product"))
        integral_config = big_operator_input._config(html(operator="Integral"))
        limit_config = big_operator_input._config(html(operator="Limit"))

        assert (
            big_operator_input._sympy_to_big_operator_json(
                sum_config, sympy.Sum(k, (k, 1, 2))
            )
            is not None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                product_config, sympy.Product(k, (k, 1, 2))
            )
            is not None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                integral_config, sympy.Integral(k, (k, 1, 2))
            )
            is not None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                limit_config, sympy.Limit(k, k, 0)
            )
            is not None
        )

        assert big_operator_input._sympy_to_big_operator_json(limit_config, k) is None
        assert (
            big_operator_input._sympy_to_big_operator_json(
                sum_config, sympy.Product(k, (k, 1, 2))
            )
            is None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                product_config, sympy.Sum(k, (k, 1, 2))
            )
            is None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                integral_config, sympy.Sum(k, (k, 1, 2))
            )
            is None
        )
        assert (
            big_operator_input._sympy_to_big_operator_json(
                replace(sum_config, operator="Custom"), sympy.Sum(k, (k, 1, 2))
            )
            is None
        )

    def test_sympy_to_big_operator_json_rejects_malformed_indexing(self) -> None:
        k = sympy.Symbol("k")
        sum_config = big_operator_input._config(html(operator="Sum"))
        limit_config = big_operator_input._config(html(operator="Limit"))
        domain_config = big_operator_input._config(
            html(**{"correct-answer": "Sum(k, (k, {1, 2}))"})
        )
        domain_sum = sympy.Basic.__new__(
            sympy.Sum, k, sympy.Tuple(k, sympy.FiniteSet(1, 2))
        )

        assert (
            big_operator_input._sympy_to_big_operator_json(domain_config, domain_sum)
            is not None
        )
        with pytest.raises(ValueError, match="exactly one indexing tuple"):
            big_operator_input._sympy_to_big_operator_json(
                sum_config, sympy.Basic.__new__(sympy.Sum, k)
            )
        with pytest.raises(ValueError, match="3-item indexing tuple"):
            big_operator_input._sympy_to_big_operator_json(sum_config, domain_sum)
        with pytest.raises(ValueError, match="does not support indexing"):
            big_operator_input._sympy_to_big_operator_json(
                replace(domain_config, indexing="approaches"), domain_sum
            )
        with pytest.raises(TypeError, match="index must be a symbol"):
            big_operator_input._sympy_to_big_operator_json(
                limit_config, sympy.Limit(k, k + 1, 0)
            )
        with pytest.raises(TypeError, match="index must be a symbol"):
            big_operator_input._sympy_to_big_operator_json(
                sum_config,
                sympy.Basic.__new__(sympy.Sum, k, sympy.Tuple(k + 1, 1, 2)),
            )

    def test_sympy_to_big_operator_json_accepts_latex_subscript(self) -> None:
        ell_g = sympy.Symbol("ell_g")
        config = big_operator_input._config(
            html(**{"correct-answer": "Sum(ell_g, (ell_g, 1, 2))"})
        )

        answer = big_operator_input._sympy_to_big_operator_json(
            config,
            sympy.Sum(ell_g, (ell_g, 1, 2)),
        )

        assert answer is not None
        assert pbo.json_to_big_operator(answer)["index"] == ell_g

    @pytest.mark.parametrize(
        ("operator", "source", "match"),
        [
            ("Sum", "Sum(k, (k, 1))", "3-item indexing tuple"),
            ("Sum", "Sum(INVALID, (k, 1, 2))", "invalid SymPy data"),
            ("Sum", "Sum(k, (k, INVALID, 2))", "invalid SymPy data"),
            ("Limit", "Limit(k, (k, 0, '?'))", "Limit direction"),
        ],
    )
    def test_formatted_answers_report_specific_invalid_component(
        self, operator: str, source: str, match: str
    ) -> None:
        config = big_operator_input._config(html(operator=operator))

        with pytest.raises(ValueError, match=match):
            big_operator_input._answer_json(config, source)


class TestPrepareUnits:
    def test_duplicate_answer_name_is_rejected(self) -> None:
        data = question_data()
        big_operator_input.prepare(html(operator="Sum"), data)

        with pytest.raises(KeyError, match='Duplicate "answers-name"'):
            big_operator_input.prepare(html(operator="Sum"), data)

    def test_correct_answer_attribute_cannot_replace_server_answer(self) -> None:
        data = question_data("Sum(k, (k, 1, 2))")
        markup = html(**{"correct-answer": "Sum(k, (k, 3, 4))"})

        with pytest.raises(ValueError, match="duplicate correct_answers"):
            big_operator_input.prepare(markup, data)

        assert data["correct_answers"]["op"] == "Sum(k, (k, 1, 2))"

    def test_formatted_complex_answer_uses_either_imaginary_unit(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(j*k, (k, 1, 2))",
            "allow-complex": "true",
            "imaginary-unit-for-display": "i",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = pbo.json_to_big_operator(data["correct_answers"]["op"])
        assert answer["body"] == sympy.I * sympy.Symbol("k")

    @pytest.mark.parametrize(
        ("correct_answer", "operator", "indexing", "index", "grading_method"),
        [
            ("Sum(k**2, (k, 1, 4))", "Sum", "bounds", "k", "equivalent"),
            ("Product(k, (k, 1, 4))", "Product", "bounds", "k", "equivalent"),
            ("Integral(k, (k, 0, 1))", "Integral", "bounds", "k", "equivalent"),
            ("Integral(z, (z, Gamma))", "Integral", "domain", "z", "component"),
            (
                "Limit(sin(x) / x, (x, 0, '+'))",
                "Limit",
                "approaches",
                "x",
                "equivalent",
            ),
            ("Union({k}, (k, {1, 2}))", "Union", "domain", "k", "equivalent"),
            (
                "Intersection({k}, (k, {1, 2}))",
                "Intersection",
                "domain",
                "k",
                "equivalent",
            ),
            (
                "DisjointUnion({k}, (k, {1, 2}))",
                "DisjointUnion",
                "domain",
                "k",
                "equivalent",
            ),
            ("Min(k**2, (k, {1, 2}))", "Min", "domain", "k", "equivalent"),
            ("Max(k**2, (k, {1, 2}))", "Max", "domain", "k", "equivalent"),
        ],
    )
    def test_whole_answer_infers_configuration(
        self,
        correct_answer: str,
        operator: str,
        indexing: str,
        index: str,
        grading_method: str,
    ) -> None:
        markup = html(**{
            "correct-answer": correct_answer,
            "variables": "Gamma",
            "grading-method": grading_method,
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = data["correct_answers"]["op"]
        config = big_operator_input._config(markup, data)
        assert answer["operator"] == operator
        assert answer["indexing"] == indexing
        assert config.operator == operator
        assert config.indexing == indexing
        assert config.index == index

    @pytest.mark.parametrize(
        ("direction", "expected"),
        [("+", "from-right"), ("-", "from-left"), ("+-", "two-sided")],
    )
    def test_limit_direction_is_normalized(self, direction: str, expected: str) -> None:
        markup = html(**{
            "correct-answer": f"Limit(k, (k, 0, '{direction}'))",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        assert data["correct_answers"]["op"]["direction"] == expected

    @pytest.mark.parametrize(
        ("correct_answer", "operator"),
        [
            (sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4)), "Sum"),
            (sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4)), "Product"),
            (sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1)), "Integral"),
        ],
    )
    def test_sympy_json_answers_are_normalized(
        self, correct_answer: sympy.Expr, operator: str
    ) -> None:
        data = question_data(psu.sympy_to_json(correct_answer))

        big_operator_input.prepare(html(), data)

        answer = data["correct_answers"]["op"]
        decoded = pbo.json_to_big_operator(answer)
        assert answer["_type"] == "big_operator"
        assert answer["operator"] == operator
        assert decoded["body"] == correct_answer.args[0]
        assert data["params"] == {}

    def test_structured_answers_are_recanonicalized(self) -> None:
        k = sympy.Symbol("k")
        correct_answer = pbo.big_operator_to_json(
            operator="Sum",
            indexing="bounds",
            index=k,
            lower=1,
            upper=2,
            body=k + 1,
        )
        correct_answer["body"]["_value"] = "1 + k"
        data = question_data(correct_answer)

        big_operator_input.prepare(html(), data)

        assert data["correct_answers"]["op"]["body"]["_value"] == "k + 1"

    def test_custom_operator_is_inferred_from_complete_answer(self) -> None:
        markup = html(**{
            "correct-answer": "Custom(k**2, (k, 1, 4))",
            "operator-latex": r"\mathbb{E}",
            "grading-method": "exact",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = data["correct_answers"]["op"]
        assert answer["operator"] == "Custom"
        assert "operator_latex" not in answer

    def test_builtin_operator_latex_override_retains_inferred_semantics(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "operator-latex": r"\Sigma",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        config = big_operator_input._config(markup, data)
        assert config.operator == "Sum"
        assert config.operator_latex == r"\Sigma"
        assert data["correct_answers"]["op"]["operator"] == "Sum"

    @pytest.mark.parametrize(
        "attribute", ["operator", "index-variable", "indexing", "limit-direction"]
    )
    def test_removed_structural_attributes_are_rejected(self, attribute: str) -> None:
        markup = (
            f'<pl-big-operator-input answers-name="op" correct-answer="Sum(k, (k, 1, 2))" '
            f'{attribute}="Sum"></pl-big-operator-input>'
        )

        with pytest.raises(ValueError, match="Unknown attribute"):
            big_operator_input.prepare(markup, question_data())

    def test_noninferable_correct_answer_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="supported complete answer"):
            big_operator_input.prepare(html(), question_data("k**2"))

    def test_raw_sympy_correct_answer_is_rejected(self) -> None:
        correct_answer = sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4))

        with pytest.raises(ValueError, match="supported complete answer"):
            big_operator_input.prepare(html(), question_data(correct_answer))

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
                html(**{"correct-answer": correct_answer}),
                question_data(),
            )

    @pytest.mark.parametrize(
        ("representation", "component"),
        [
            ("formatted-lower", "lower"),
            ("canonical-upper", "upper"),
            ("sympy-json-target", "target"),
            ("formatted-body", "body"),
        ],
    )
    def test_expression_components_reject_sets(
        self, representation: str, component: str
    ) -> None:
        index = sympy.Symbol("k")
        match representation:
            case "formatted-lower":
                correct_answer: object = "Sum(k, (k, {1}, 2))"
            case "canonical-upper":
                config = big_operator_input._config(html(operator="Sum"))
                correct_answer = big_operator_input._canonical_json(
                    config,
                    {
                        "lower": sympy.Integer(1),
                        "upper": sympy.FiniteSet(2),
                        "body": index,
                    },
                )
            case "sympy-json-target":
                correct_answer = psu.sympy_to_json(
                    sympy.Limit(index, index, sympy.FiniteSet(0), dir="+"),
                    allow_sets=True,
                )
            case "formatted-body":
                correct_answer = "Sum({k}, (k, 1, 2))"
            case _:
                raise AssertionError("Unhandled test representation")

        with pytest.raises(
            ValueError, match=rf'component "{component}" must be an expression'
        ):
            big_operator_input.prepare(html(), question_data(correct_answer))

    def test_set_components_accept_declared_bare_symbols(self) -> None:
        markup = html(**{
            "correct-answer": "Union(A, (k, D))",
            "variables": "A,D",
            "grading-method": "exact",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = pbo.json_to_big_operator(data["correct_answers"]["op"])
        assert answer["indexing"] == "domain"
        assert answer["domain"] == sympy.Symbol("D")
        assert answer["body"] == sympy.Symbol("A")


class TestParseUnits:
    @pytest.mark.parametrize(
        ("operator", "indexing", "raw", "expected_components"),
        [
            (
                "Sum",
                "bounds",
                {"op-lower": "1", "op-upper": "4", "op-body": "k^2"},
                {"lower", "upper", "body"},
            ),
            (
                "Union",
                "domain",
                {"op-domain": "{1, 2}", "op-body": "{k}"},
                {"domain", "body"},
            ),
            (
                "Limit",
                "approaches",
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
        indexing: str,
        raw: dict[str, str],
        expected_components: set[str],
    ) -> None:
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(html(operator=operator, indexing=indexing), data)

        answer = data["submitted_answers"]["op"]
        assert answer["_type"] == "big_operator"
        assert answer["operator"] == operator
        assert answer["indexing"] == indexing
        assert expected_components <= answer.keys()
        assert set(data["submitted_answers"]) == {"op"}
        assert not data.get("format_errors")

    def test_formula_editor_transport_fields_are_not_persisted(self) -> None:
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-lower-latex": "1",
                "op-upper": "2",
                "op-upper-latex": "2",
                "op-body": "k",
                "op-body-latex": "k",
                "other-answer": "unchanged",
            }
        )

        big_operator_input.parse(html(operator="Sum"), data)

        assert set(data["submitted_answers"]) == {"op", "other-answer"}
        assert data["submitted_answers"]["other-answer"] == "unchanged"

    @pytest.mark.parametrize("panel", ["question", "submission"])
    def test_formula_editor_transport_cleanup_preserves_render(
        self, panel: Literal["question", "submission"]
    ) -> None:
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-lower-latex": "1",
                "op-upper": "2",
                "op-upper-latex": "2",
                "op-body": "k",
                "op-body-latex": "k",
            },
            panel=panel,
        )

        big_operator_input.parse(html(operator="Sum"), data)
        rendered = big_operator_input.render(html(operator="Sum"), data)

        if panel == "question":
            assert 'name="op-lower"' in rendered
            assert 'name="op-upper"' in rendered
            assert 'name="op-body"' in rendered
        else:
            assert r"\sum_{k=1}^{2} k" in rendered

    @pytest.mark.parametrize(
        ("operator", "field"),
        [
            ("Sum", "op-domain"),
            ("Union", "op-domain"),
            ("Union", "op-body"),
        ],
    )
    def test_set_fields_reject_non_sets(self, operator: str, field: str) -> None:
        raw = {"op-domain": "1", "op-body": "{k}"}
        if field == "op-body":
            raw = {"op-domain": "{1, 2}", "op-body": "k + 1"}
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(html(operator=operator, indexing="domain"), data)

        assert data["submitted_answers"]["op"] is None
        assert data["format_errors"][field] == "This field must be a set."

    @pytest.mark.parametrize(
        ("operator", "indexing", "raw", "field"),
        [
            (
                "Sum",
                "bounds",
                {"op-lower": "{1}", "op-upper": "2", "op-body": "k"},
                "op-lower",
            ),
            (
                "Sum",
                "bounds",
                {"op-lower": "1", "op-upper": "{2}", "op-body": "k"},
                "op-upper",
            ),
            (
                "Limit",
                "approaches",
                {
                    "op-target": "{0}",
                    "op-body": "k",
                    "op-direction": "from-right",
                },
                "op-target",
            ),
            (
                "Sum",
                "bounds",
                {"op-lower": "1", "op-upper": "2", "op-body": "{k}"},
                "op-body",
            ),
        ],
    )
    def test_expression_fields_reject_sets(
        self,
        operator: str,
        indexing: str,
        raw: dict[str, str],
        field: str,
    ) -> None:
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(html(operator=operator, indexing=indexing), data)

        assert data["submitted_answers"]["op"] is None
        assert "set notation is not allowed" in data["format_errors"][field]

    def test_set_fields_accept_declared_bare_symbols(self) -> None:
        data = question_data(raw_submitted_answers={"op-domain": "D", "op-body": "A"})

        big_operator_input.parse(
            html(
                operator="Union",
                indexing="domain",
                variables="A,D",
            ),
            data,
        )

        answer = pbo.json_to_big_operator(data["submitted_answers"]["op"])
        assert answer["indexing"] == "domain"
        assert answer["domain"] == sympy.Symbol("D")
        assert answer["body"] == sympy.Symbol("A")

    @pytest.mark.parametrize(
        ("allowed_blank", "raw"),
        [
            ("indices", {"op-lower": "", "op-upper": "2", "op-body": "k"}),
            ("body", {"op-lower": "1", "op-upper": "2", "op-body": ""}),
            ("all", {"op-lower": "", "op-upper": "", "op-body": ""}),
        ],
    )
    def test_configured_blank_fields_are_accepted(
        self, allowed_blank: str, raw: dict[str, str]
    ) -> None:
        data = question_data(raw_submitted_answers=raw)

        big_operator_input.parse(
            html(operator="Sum", **{"allowed-blank": allowed_blank}), data
        )

        assert data["submitted_answers"]["op"] == ""
        assert not data.get("format_errors")

    def test_blank_required_fields_have_field_errors(self) -> None:
        data = question_data(
            raw_submitted_answers={"op-lower": "", "op-upper": "", "op-body": ""}
        )

        big_operator_input.parse(html(operator="Sum"), data)

        assert data["submitted_answers"]["op"] is None
        assert set(data["format_errors"]) == {"op-lower", "op-upper", "op-body"}

    def test_custom_functions_are_available_in_the_body(self) -> None:
        markup = html(
            operator="Sum",
            **{"custom-functions": "f", "variables": "x"},
        )
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
                "op-body": "f(k) + x",
            }
        )

        big_operator_input.parse(markup, data)

        decoded = pbo.json_to_big_operator(data["submitted_answers"]["op"])
        assert decoded["body"] == sympy.Function("f")(sympy.Symbol("k")) + sympy.Symbol(
            "x"
        )


class TestGradeUnits:
    def test_equivalent_grading_timeout_is_reported_as_format_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        markup = html(operator="Sum")
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
                "op-body": "k",
            }
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)
        monkeypatch.setattr(big_operator_input, "SYMPY_TIMEOUT", 0.01)
        monkeypatch.setattr(
            big_operator_input,
            "_expressions_equivalent",
            lambda _left, _right: time.sleep(1),
        )

        big_operator_input.grade(markup, data)

        assert data["format_errors"]["op"] == (
            big_operator_input.SYMPY_TIMEOUT_FORMAT_ERROR
        )
        assert data["partial_scores"]["op"] == {"score": 0.0, "weight": 1}

    def test_component_score_badges_timeout_without_failing_render(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        markup = html(
            operator="Sum",
            **{"grading-method": "component"},
        )
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
                "op-body": "k",
            },
        )
        prepare_parse_grade(markup, data)
        monkeypatch.setattr(big_operator_input, "SYMPY_TIMEOUT", 0.01)
        monkeypatch.setattr(
            big_operator_input,
            "_expressions_equivalent",
            lambda _left, _right: time.sleep(1),
        )

        rendered = big_operator_input.render(markup, data)

        assert rendered.count('class="badge') == 1

    @pytest.mark.parametrize(
        ("operator", "indexing"),
        [
            ("Sum", "bounds"),
            ("Sum", "domain"),
            ("Product", "bounds"),
            ("Product", "domain"),
            ("Integral", "bounds"),
            ("Limit", "approaches"),
            ("Union", "bounds"),
            ("Union", "domain"),
            ("Intersection", "bounds"),
            ("Intersection", "domain"),
            ("DisjointUnion", "bounds"),
            ("DisjointUnion", "domain"),
            ("Min", "domain"),
            ("Max", "domain"),
        ],
    )
    def test_equivalent_grading_accepts_each_supported_builtin_configuration(
        self,
        operator: str,
        indexing: Literal["bounds", "domain", "approaches"],
    ) -> None:
        body = r"{k}" if operator in {"Union", "Intersection", "DisjointUnion"} else "k"
        raw_submitted_answers = {"op-body": body}
        match indexing:
            case "bounds":
                raw_submitted_answers.update({"op-lower": "1", "op-upper": "2"})
            case "domain":
                raw_submitted_answers["op-domain"] = "{1, 2}"
            case "approaches":
                raw_submitted_answers.update({
                    "op-target": "0",
                    "op-direction": "two-sided",
                })

        data = question_data(raw_submitted_answers=raw_submitted_answers)

        prepare_parse_grade(html(operator=operator, indexing=indexing), data)

        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}

    @pytest.mark.parametrize(
        ("grading_method", "expected_score"),
        [("component", 0.75), ("equivalent", 0.0)],
    )
    def test_set_grading_handles_incorrect_domain(
        self, grading_method: str, expected_score: float
    ) -> None:
        markup = html(**{
            "correct-answer": "Union({k}, (k, {1, 2}))",
            "grading-method": grading_method,
        })
        data = question_data(
            raw_submitted_answers={"op-domain": "{1, 3}", "op-body": "{k}"}
        )

        prepare_parse_grade(markup, data)

        assert data["partial_scores"]["op"]["score"] == pytest.approx(expected_score)

    @pytest.mark.parametrize(
        ("correct_answer", "variables", "match"),
        [
            (
                "Integral(k, (k, {1, 2}))",
                None,
                "domain integrals",
            ),
            (
                "Sum(k, (k, D))",
                "D",
                "concrete FiniteSet",
            ),
        ],
    )
    def test_unsupported_equivalent_configurations_are_rejected_during_prepare(
        self, correct_answer: str, variables: str | None, match: str
    ) -> None:
        markup = html(**{
            "correct-answer": correct_answer,
            "variables": variables,
        })

        with pytest.raises(ValueError, match=match):
            big_operator_input.prepare(markup, question_data())

    @pytest.mark.parametrize(
        "grading_method", ["exact", "equivalent", "component", "none"]
    )
    def test_inferred_whole_answer_supports_every_grading_method(
        self, grading_method: str
    ) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "grading-method": grading_method,
        })
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "4",
                "op-body": "k^2",
            }
        )

        prepare_parse_grade(markup, data)

        if grading_method == "none":
            assert "op" not in data.get("partial_scores", {})
        else:
            assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}

    def test_none_grading_displays_correct_answer_without_scoring(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "grading-method": "none",
        })
        data = question_data(
            raw_submitted_answers={
                "op-lower": "10",
                "op-upper": "20",
                "op-body": "k + 1",
            }
        )

        prepare_parse_grade(markup, data)

        assert data["submitted_answers"]["op"] is not None
        assert "op" not in data.get("partial_scores", {})

        data["panel"] = "answer"
        rendered = big_operator_input.render(markup, data)
        assert r"\sum_{k=1}^{4} k^{2}" in rendered
        assert "badge" not in rendered

    def test_none_grading_supports_custom_operators(self) -> None:
        markup = html(**{
            "correct-answer": "Custom(k**2, (k, 1, 4))",
            "operator-latex": r"\bigstar",
            "grading-method": "none",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        assert data["correct_answers"]["op"]["operator"] == "Custom"

    def test_none_grading_generates_unscored_test_input(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "grading-method": "none",
        })
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

        assert data["submitted_answers"]["op"] is not None
        assert data["partial_scores"] == {}

    def test_component_grading_uses_equivalence_and_body_weight(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(2*k, (k, 2, 4))",
            "grading-method": "component",
            "body-relative-weight": "2",
        })
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1 + 1",
                "op-upper": "5",
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
        markup = html(**{
            "correct-answer": "Limit(1/k, (k, 0, '+'))",
            "grading-method": "component",
        })
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
        markup = html(**{"correct-answer": "Sum(k**2, (k, 1, 4))"})
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
            "op-lower": "1",
            "op-upper": "4",
            "op-body": "k**2",
        }
        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}

    def test_equivalent_construction_covers_each_indexing_shape(self) -> None:
        k = sympy.Symbol("k")
        bounds_config = big_operator_input._config(html(operator="Sum"))
        limit_config = big_operator_input._config(html(operator="Limit"))
        domain_config = big_operator_input._config(
            html(**{"correct-answer": "Sum(k, (k, {1, 2}))"})
        )
        integral_domain_config = big_operator_input._config(
            html(**{"correct-answer": "Integral(k, (k, D))", "variables": "D"})
        )

        bounds_values = {
            "lower": sympy.Integer(1),
            "upper": sympy.Integer(2),
            "body": k,
        }
        domain_values = {"domain": sympy.FiniteSet(1, 2), "body": k}
        approach_values = {"target": sympy.Integer(0), "body": 1 / k}

        assert big_operator_input._construct(
            replace(bounds_config, operator="Custom"), bounds_values
        ) == sympy.Tuple(k, (k, 1, 2))
        assert big_operator_input._construct(
            limit_config, approach_values, "from-right"
        ) == sympy.Limit(1 / k, k, 0, dir="+")
        assert big_operator_input._construct(domain_config, domain_values) == 3
        assert big_operator_input._construct(
            replace(domain_config, operator="Custom"), domain_values
        ) == sympy.Tuple(1, 2)
        assert (
            big_operator_input._construct(
                replace(domain_config, operator="Max"), domain_values
            )
            == 2
        )

        with pytest.raises(NotImplementedError, match="domain integrals"):
            big_operator_input._construct(integral_domain_config, domain_values)
        with pytest.raises(NotImplementedError, match="concrete FiniteSet"):
            big_operator_input._construct(
                domain_config, {"domain": sympy.Interval(1, 2), "body": k}
            )

    @pytest.mark.parametrize(
        ("test_type", "operator"),
        [
            ("correct", "Limit"),
            ("incorrect", "Limit"),
            ("invalid", "Sum"),
        ],
    )
    def test_generated_submissions_cover_each_test_type(
        self, test_type: str, operator: str
    ) -> None:
        markup = html(operator=operator)
        data = question_data()
        big_operator_input.prepare(markup, data)
        data.update(
            test_type=test_type,
            raw_submitted_answers={},
            partial_scores={},
            format_errors={},
        )

        big_operator_input.test(markup, data)

        if test_type == "invalid":
            assert data["format_errors"]
        else:
            assert data["raw_submitted_answers"]
            assert data["partial_scores"]["op"]["score"] == pytest.approx(
                float(test_type == "correct")
            )

    def test_blank_allowed_submission_grades_as_incorrect(self) -> None:
        markup = html(operator="Sum", **{"allowed-blank": "all"})
        data = question_data(
            raw_submitted_answers={
                "op-lower": "",
                "op-upper": "",
                "op-body": "",
            }
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)
        big_operator_input.grade(markup, data)

        assert data["partial_scores"]["op"] == {"score": 0.0, "weight": 1}


class TestRenderUnits:
    @pytest.mark.parametrize(
        ("operator", "indexing", "present", "absent"),
        [
            ("Sum", "bounds", ("op-lower", "op-upper", "op-body"), ("op-domain",)),
            ("Union", "domain", ("op-domain", "op-body"), ("op-lower", "op-upper")),
            (
                "Limit",
                "approaches",
                ("op-target", "op-direction", "op-body"),
                ("op-lower", "op-domain"),
            ),
        ],
    )
    def test_question_panel_renders_fields_for_indexing(
        self,
        operator: str,
        indexing: str,
        present: tuple[str, ...],
        absent: tuple[str, ...],
    ) -> None:
        rendered = big_operator_input.render(
            html(operator=operator, indexing=indexing), question_data()
        )

        for field in present:
            assert f'name="{field}"' in rendered
        for field in absent:
            assert f'name="{field}"' not in rendered

    @pytest.mark.parametrize(
        ("operator", "indexing", "field_names"),
        [
            ("Sum", "bounds", ("op-lower", "op-upper", "op-body")),
            ("Integral", "bounds", ("op-lower", "op-upper", "op-body")),
            ("Integral", "domain", ("op-domain", "op-body")),
            ("Union", "domain", ("op-domain", "op-body")),
            ("Limit", "approaches", ("op-target", "op-direction", "op-body")),
        ],
    )
    def test_question_panel_fields_follow_tab_order(
        self, operator: str, indexing: str, field_names: tuple[str, ...]
    ) -> None:
        rendered = big_operator_input.render(
            html(operator=operator, indexing=indexing), question_data()
        )

        operator_position = rendered.index('class="pl-big-operator-input__operator"')
        field_positions = [rendered.index(f'name="{name}"') for name in field_names]

        assert operator_position < field_positions[0]
        assert field_positions == sorted(field_positions)

    @pytest.mark.parametrize(
        ("direction", "invalid"),
        [("sideways", True), ("two-sided", False)],
    )
    def test_direction_input_exposes_validation_state(
        self, direction: str, invalid: bool
    ) -> None:
        markup = html(operator="Limit")
        data = question_data(
            raw_submitted_answers={
                "op-target": "0",
                "op-direction": direction,
                "op-body": "1/k",
            }
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)

        root = lxml.html.fragment_fromstring(big_operator_input.render(markup, data))
        select = root.get_element_by_id("op-direction")

        if invalid:
            assert select.get("aria-invalid") == "true"
            assert select.get("aria-errormessage") == "op-direction-feedback"
            feedback = root.get_element_by_id("op-direction-feedback")
            assert feedback.text_content() == "Select a valid limit direction."
        else:
            assert select.get("aria-invalid") is None
            assert select.get("aria-errormessage") is None
            assert root.xpath('//*[@id="op-direction-feedback"]') == []

    @pytest.mark.parametrize("operator", ["Integral", "Sum"])
    def test_question_panel_operator_is_accessibility_exposed(
        self, operator: str
    ) -> None:
        rendered = big_operator_input.render(html(operator=operator), question_data())

        assert '<span class="pl-big-operator-input__operator">' in rendered

    @pytest.mark.parametrize(
        ("display", "expected_display", "expected_tag"),
        [
            (None, "block", "div"),
            ("inline", "inline", "span"),
            ("block", "block", "div"),
        ],
    )
    @pytest.mark.parametrize("panel", ["question", "answer", "submission"])
    def test_display_controls_layout_in_every_panel(
        self,
        display: str | None,
        expected_display: str,
        expected_tag: str,
        panel: Literal["question", "answer", "submission"],
    ) -> None:
        markup = html(operator="Sum", display=display)
        data = question_data(panel=panel)
        big_operator_input.prepare(markup, data)

        rendered = big_operator_input.render(markup, data)
        root = lxml.html.fragment_fromstring(rendered)

        assert root.tag == expected_tag
        assert f"pl-big-operator-input--{expected_display}" in root.classes
        if panel != "question":
            submission_values = root.xpath(
                './/*[contains(concat(" ", normalize-space(@class), " "), '
                '" pl-big-operator-input__submission-value ")]'
            )
            assert len(submission_values) == 1

    def test_question_panel_configures_imaginary_unit_for_every_field(self) -> None:
        rendered = big_operator_input.render(
            html(
                operator="Sum",
                **{
                    "allow-complex": "true",
                    "imaginary-unit-for-display": "j",
                },
            ),
            question_data(),
        )

        assert rendered.count('imaginary-unit="j"') == 3

    def test_question_panel_configures_log_display_for_every_field(self) -> None:
        rendered = big_operator_input.render(
            html(operator="Sum", **{"display-log-as-ln": "true"}),
            question_data(),
        )

        assert rendered.count('log-as-ln="log-as-ln"') == 3

    @pytest.mark.parametrize("panel", ["answer", "submission"])
    def test_log_display_uses_ln_in_read_only_panels(
        self, panel: Literal["answer", "submission"]
    ) -> None:
        markup = html(**{
            "correct-answer": "Sum(log(k), (k, log(2), log(3)))",
            "display-log-as-ln": "true",
        })
        data = question_data(panel=panel)
        big_operator_input.prepare(markup, data)
        if panel == "submission":
            data["submitted_answers"]["op"] = data["correct_answers"]["op"]

        rendered = big_operator_input.render(markup, data)

        assert "\\ln" in rendered
        assert "\\log" not in rendered

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

    @pytest.mark.parametrize(
        "latex_override", [False, True], ids=["default-latex", "custom-latex"]
    )
    @pytest.mark.parametrize("operator", ["Integral", "Union"])
    @pytest.mark.parametrize(
        "indexing", ["bounds", "domain"], ids=["two-bounds", "single-bound"]
    )
    @pytest.mark.parametrize("panel", ["answer", "submission"])
    def test_operator_limit_position(
        self,
        latex_override: bool,
        operator: Literal["Integral", "Union"],
        indexing: Literal["bounds", "domain"],
        panel: Literal["answer", "submission"],
    ) -> None:
        function_name = "Integral" if operator == "Integral" else "Union"
        body = "k" if operator == "Integral" else "{k}"
        index_spec = "(k, 0, 1)" if indexing == "bounds" else "(k, gamma)"
        operator_latex = (
            (r"\oint" if operator == "Integral" else r"\bigoplus")
            if latex_override
            else None
        )
        markup = html(**{
            "correct-answer": f"{function_name}({body}, {index_spec})",
            "operator-latex": operator_latex,
            "variables": "gamma",
            "grading-method": "component",
        })
        raw_submitted_answers = {"op-body": body}
        if indexing == "bounds":
            raw_submitted_answers.update({"op-lower": "0", "op-upper": "1"})
        else:
            raw_submitted_answers["op-domain"] = "gamma"
        data = question_data(raw_submitted_answers=raw_submitted_answers, panel=panel)
        big_operator_input.prepare(markup, data)
        if panel == "submission":
            big_operator_input.parse(markup, data)

        rendered = big_operator_input.render(markup, data)

        operator_tex = {
            ("Integral", False): r"\int",
            ("Integral", True): r"\mathop{\oint}\nolimits",
            ("Union", False): r"\bigcup",
            ("Union", True): r"\mathop{\bigoplus}\limits",
        }[operator, latex_override]
        if indexing == "bounds":
            subscript = "0" if operator == "Integral" else "k=0"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}^{{1}}"
        else:
            subscript = r"\gamma" if operator == "Integral" else r"k\in \gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}"
        suffix = r"\,\mathrm{d}k" if operator == "Integral" else ""
        body_tex = "k" if operator == "Integral" else r"\left\{k\right\}"

        assert f"{indexed_operator} {body_tex}{suffix}" in rendered

    def test_submission_formats_valid_components_when_another_is_invalid(self) -> None:
        markup = html(**{
            "correct-answer": "Integral(1/z, (z, gamma))",
            "operator-latex": r"\oint",
            "variables": "gamma",
            "grading-method": "component",
        })
        data = question_data(
            raw_submitted_answers={"op-domain": "gamma", "op-body": "dz"},
            panel="submission",
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert data["submitted_answers"]["op"] is None
        assert r"\mathop{\oint}\nolimits_{\gamma} dz\,\mathrm{d}z" in rendered

    @pytest.mark.parametrize(
        "latex_override", [False, True], ids=["default-latex", "custom-latex"]
    )
    @pytest.mark.parametrize("operator", ["Integral", "Union"])
    @pytest.mark.parametrize(
        "indexing", ["bounds", "domain"], ids=["two-bounds", "single-bound"]
    )
    def test_submission_formats_valid_component_when_all_others_are_blank(
        self,
        latex_override: bool,
        operator: Literal["Integral", "Union"],
        indexing: Literal["bounds", "domain"],
    ) -> None:
        function_name = "Integral" if operator == "Integral" else "Union"
        body = "k" if operator == "Integral" else "{k}"
        index_spec = "(k, 0, 1)" if indexing == "bounds" else "(k, gamma)"
        operator_latex = (
            (r"\oint" if operator == "Integral" else r"\bigoplus")
            if latex_override
            else None
        )
        markup = html(**{
            "correct-answer": f"{function_name}({body}, {index_spec})",
            "operator-latex": operator_latex,
            "variables": "gamma",
            "grading-method": "component",
        })
        raw_submitted_answers = {"op-body": ""}
        if indexing == "bounds":
            raw_submitted_answers.update({"op-lower": "gamma", "op-upper": ""})
        else:
            raw_submitted_answers["op-domain"] = "gamma"
        data = question_data(
            raw_submitted_answers=raw_submitted_answers,
            panel="submission",
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert data["submitted_answers"]["op"] is None
        operator_tex = {
            ("Integral", False): r"\int",
            ("Integral", True): r"\mathop{\oint}\nolimits",
            ("Union", False): r"\bigcup",
            ("Union", True): r"\mathop{\bigoplus}\limits",
        }[operator, latex_override]
        if indexing == "bounds":
            subscript = r"\gamma" if operator == "Integral" else r"k=\gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}^{{}}"
        else:
            subscript = r"\gamma" if operator == "Integral" else r"k\in \gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}"

        assert indexed_operator in rendered

    @pytest.mark.parametrize("panel", ["answer", "submission"])
    def test_complete_notation_uses_configured_imaginary_unit(
        self, panel: Literal["answer", "submission"]
    ) -> None:
        base_config = big_operator_input._config(html(operator="Sum"))
        correct_answer = big_operator_input._canonical_json(
            base_config,
            {
                "lower": sympy.Integer(1),
                "upper": sympy.Integer(2),
                "body": sympy.I * sympy.Symbol("k"),
            },
        )
        markup = html(**{
            "allow-complex": "true",
            "imaginary-unit-for-display": "j",
        })
        data = question_data(
            correct_answer,
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
                "op-body": "i*k",
            },
            panel=panel,
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert r"\sum_{k=1}^{2} j k" in rendered

    @pytest.mark.parametrize("panel", ["question", "answer", "submission"])
    def test_prefix_and_suffix_latex_render_in_every_panel(
        self, panel: Literal["question", "answer", "submission"]
    ) -> None:
        markup = html(**{
            "correct-answer": "Integral(k, (k, 0, 1))",
            "prefix-latex": r"\Gamma(z) =",
            "suffix-latex": r", \quad \operatorname{Re}(z) > 0",
        })
        data = question_data(panel=panel)
        big_operator_input.prepare(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert r"\Gamma(z) =" in rendered
        assert r", \quad \operatorname{Re}(z) > 0" in rendered

    def test_component_grading_renders_per_field_feedback(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "grading-method": "component",
        })
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "5",
                "op-body": "k^2",
            }
        )
        prepare_parse_grade(markup, data)

        rendered = big_operator_input.render(markup, data)

        assert rendered.count("fa-check") == 2
        assert rendered.count("fa-times") == 1

    @pytest.mark.parametrize(
        ("panel", "direction_tex"),
        [("question", r"{}^+"), ("submission", r"0^+")],
    )
    def test_fixed_limit_direction_and_incorrect_score_render(
        self, panel: Literal["question", "submission"], direction_tex: str
    ) -> None:
        markup = html(**{
            "correct-answer": "Limit(1/k, (k, 0, '+'))",
            "allow-approach-direction-input": "false",
        })
        data = question_data(
            raw_submitted_answers={"op-target": "0", "op-body": "1/k"},
            panel=panel,
        )
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)
        data["partial_scores"]["op"] = {"score": 0}

        rendered = big_operator_input.render(markup, data)

        assert direction_tex in rendered
        assert "text-bg-danger" in rendered

    def test_component_scores_ignore_missing_or_malformed_submission(self) -> None:
        markup = html(operator="Sum", **{"grading-method": "component"})
        config = big_operator_input._config(markup)
        data = question_data()
        data["partial_scores"]["op"] = {"score": 0}

        assert big_operator_input._component_scores(config, data) == {}

        data["submitted_answers"]["op"] = {"invalid": True}
        assert big_operator_input._component_scores(config, data) == {}


class TestCorrectAnswerRegressions:
    @pytest.mark.parametrize(
        ("operator", "actual_indexing"),
        [
            ("Sum", "domain"),
            ("Union", "bounds"),
            ("Limit", "bounds"),
        ],
    )
    def test_structured_answer_indexing_must_match_element(
        self, operator: str, actual_indexing: str
    ) -> None:
        config = big_operator_input._config(html(operator=operator))

        with pytest.raises(ValueError, match="indexing does not match"):
            big_operator_input._get_values(
                config,
                {"indexing": actual_indexing},
            )

    def test_sympy_coercion_rejects_non_mathematical_values(self) -> None:
        expression = sympy.Symbol("k")

        assert big_operator_input._coerce_sympy(expression) == expression
        assert big_operator_input._as_sympy(object()) is None

        with pytest.raises(TypeError, match="must be SymPy expressions"):
            big_operator_input._coerce_sympy(object())

    def test_structured_answer_rejects_disallowed_complex_value(self) -> None:
        config = big_operator_input._config(html(operator="Sum"))
        answer = big_operator_input._canonical_json(
            config,
            {
                "lower": sympy.Integer(1),
                "upper": sympy.Integer(2),
                "body": sympy.I,
            },
        )

        with pytest.raises(ValueError, match="complex"):
            big_operator_input.prepare(
                html(**{"allow-complex": "false"}),
                question_data(answer),
            )

    def test_structured_answer_rejects_undeclared_symbol(self) -> None:
        config = big_operator_input._config(html(operator="Sum"))
        answer = big_operator_input._canonical_json(
            config,
            {
                "lower": sympy.Integer(1),
                "upper": sympy.Integer(2),
                "body": sympy.Symbol("undeclared"),
            },
        )

        with pytest.raises(ValueError, match="undeclared"):
            big_operator_input.prepare(html(), question_data(answer))

    def test_symbol_named_like_sympy_function_renders_as_symbol(self) -> None:
        markup = html(**{
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
    @pytest.mark.parametrize(
        "assumed_symbol",
        ["index", "variable"],
    )
    def test_structured_answer_assumptions_are_applied_to_submissions(
        self, assumed_symbol: str
    ) -> None:
        k = (
            sympy.Symbol("k", positive=True)
            if assumed_symbol == "index"
            else sympy.Symbol("k")
        )
        n = (
            sympy.Symbol("n", positive=True)
            if assumed_symbol == "variable"
            else sympy.Symbol("n")
        )
        answer = pbo.big_operator_to_json(
            operator="Sum",
            indexing="bounds",
            index=k,
            lower="1",
            upper=n,
            body=k,
        )
        markup = html(variables="n")
        data = question_data(
            answer,
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "n",
                "op-body": "k",
            },
        )

        prepare_parse_grade(markup, data)

        correct = pbo.json_to_big_operator(data["correct_answers"]["op"])
        submitted = pbo.json_to_big_operator(data["submitted_answers"]["op"])
        assert submitted["indexing"] == "bounds"
        if assumed_symbol == "index":
            assert getattr(correct["index"], "is_positive", False) is True
            assert getattr(submitted["index"], "is_positive", False) is True
            assert getattr(submitted["body"], "is_positive", False) is True
        else:
            assert getattr(submitted["upper"], "is_positive", False) is True
        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}

    def test_server_correct_answer_infers_after_prepare(self) -> None:
        markup = html(**{"grading-method": "exact"})
        data = question_data(
            "Sum(k**2, (k, 1, 4))",
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "4",
                "op-body": "k^2",
            },
        )

        big_operator_input.prepare(markup, data)
        assert data["correct_answers"]["op"]["_type"] == "big_operator"

        big_operator_input.parse(markup, data)
        big_operator_input.grade(markup, data)
        rendered = big_operator_input.render(markup, data)

        assert data["partial_scores"]["op"] == {"score": 1.0, "weight": 1}
        assert 'name="op-lower"' in rendered

    def test_valid_reparse_clears_stale_format_error(self) -> None:
        markup = html(operator="Sum")
        data = question_data(
            raw_submitted_answers={
                "op-lower": "bad@",
                "op-upper": "2",
                "op-body": "k",
            }
        )
        big_operator_input.parse(markup, data)
        assert "op-lower" in data["format_errors"]

        data["raw_submitted_answers"]["op-lower"] = "1"
        big_operator_input.parse(markup, data)

        assert "op-lower" not in data["format_errors"]
        assert data["submitted_answers"]["op"] is not None

    def test_invalid_reparse_replaces_previous_score_with_zero(self) -> None:
        markup = html(**{"correct-answer": "Sum(k, (k, 1, 2))"})
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
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
        markup = html(**{
            "grading-method": "component",
            "correct-answer": "Sum((k+1)^2, (k, 1, 2))",
        })
        data = question_data(
            raw_submitted_answers={
                "op-lower": "1",
                "op-upper": "2",
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
        markup = html(**{"correct-answer": "Sum(k, (k, 1, 2))"})
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


class TestSymbolicInputRendering:
    def test_score_badges_do_not_show_percent(self) -> None:
        data = question_data(raw_submitted_answers={"op": "x"}, panel="submission")
        data["submitted_answers"] = {"op": "x"}
        rendered, _view = big_operator_input._render_symbolic_input(
            data,
            name="op",
            variables=("x",),
            custom_functions=(),
            aria_label="Operator body",
            size=20,
            allowed_types={"expression"},
            allow_complex=False,
            imaginary_unit="i",
            display_log_as_ln=False,
            show_score=True,
            score=0.5,
        )
        assert "text-bg-warning" in rendered
        assert re.search(r"\d+(?:\.\d+)?%", rendered) is None


class TestDocSmoke:
    @staticmethod
    def _prepare_parse_render(
        markup: str, data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        data = question_data() if data is None else data
        big_operator_input.prepare(markup, data)
        big_operator_input.parse(markup, data)
        assert big_operator_input.render(markup, data)
        assert data["correct_answers"]
        for answer in data["correct_answers"].values():
            pbo.json_to_big_operator(answer)
        return data

    @pytest.mark.parametrize(
        "markup",
        [
            pytest.param(
                html(**{
                    "answers-name": "total",
                    "correct-answer": "Sum(k**2, (k, 1, n))",
                    "variables": "n",
                }),
                id="test_sample_element",
            ),
            pytest.param(
                html(**{
                    "answers-name": "total",
                    "correct-answer": "Product(k + 1, (k, 1, 4))",
                }),
                id="test_product_correct_answer",
            ),
            pytest.param(
                html(**{
                    "answers-name": "contour",
                    "correct-answer": "Integral(z**2, (z, Gamma))",
                    "variables": "Gamma",
                    "grading-method": "component",
                }),
                id="test_domain_integral_correct_answer",
            ),
            pytest.param(
                html(**{
                    "answers-name": "sets",
                    "correct-answer": "Union({k, -k}, (k, {1, 2}))",
                    "grading-method": "exact",
                }),
                id="test_set_correct_answer",
            ),
            pytest.param(
                html(**{
                    "answers-name": "sinc-limit",
                    "correct-answer": "Limit(sin(x) / x, (x, 0, '+-'))",
                }),
                id="test_limit_correct_answer",
            ),
            pytest.param(
                html(**{
                    "answers-name": "right-limit",
                    "correct-answer": "Limit(1/x, (x, 0, '+'))",
                    "allow-approach-direction-input": "false",
                }),
                id="test_fixed_limit_direction",
            ),
            pytest.param(
                html(**{
                    "answers-name": "example-custom",
                    "correct-answer": "Custom(j**2, (j, 1, 10))",
                    "operator-latex": r"\displaystyle{\Huge\bigstar{}}",
                    "grading-method": "component",
                }),
                id="test_custom_bounds",
            ),
            pytest.param(
                html(**{
                    "answers-name": "evaluation",
                    "correct-answer": "Custom(f(x), (x, 0, '+-'))",
                    "operator-latex": r"\operatorname{eval}",
                    "custom-functions": "f",
                    "grading-method": "component",
                }),
                id="test_custom_approaches",
            ),
        ],
    )
    def test_question_html_examples(self, markup: str) -> None:
        self._prepare_parse_render(markup)

    def test_string_correct_answer(self) -> None:
        data = question_data()
        upper = 6
        data["params"]["upper"] = upper
        data["correct_answers"]["total"] = f"Product(k + 1, (k, 1, {upper}))"

        prepared = self._prepare_parse_render(html(**{"answers-name": "total"}), data)

        decoded = pbo.json_to_big_operator(prepared["correct_answers"]["total"])
        assert decoded["indexing"] == "bounds"
        assert decoded["upper"] == upper

    def test_sympy_json_correct_answer(self) -> None:
        data = question_data()
        k = sympy.Symbol("k")
        answer = cast(sympy.Expr, sympy.Product(k + 1, (k, 1, 4)))
        data["correct_answers"]["total"] = pl.to_json(answer)

        prepared = self._prepare_parse_render(html(**{"answers-name": "total"}), data)

        decoded = pbo.json_to_big_operator(prepared["correct_answers"]["total"])
        assert decoded["body"] == k + 1

    def test_custom_python_correct_answer(self) -> None:
        data = question_data()
        x = sympy.Symbol("x")
        data["correct_answers"]["evaluation"] = pbo.big_operator_to_json(
            operator="Custom",
            indexing="approaches",
            index=x,
            target=0,
            direction="two-sided",
            body=sympy.Function("f")(x),
        )
        markup = html(**{
            "answers-name": "evaluation",
            "operator-latex": r"\operatorname{eval}",
            "custom-functions": "f",
            "grading-method": "component",
        })

        prepared = self._prepare_parse_render(markup, data)

        decoded = pbo.json_to_big_operator(prepared["correct_answers"]["evaluation"])
        assert decoded["operator"] == "Custom"
        assert decoded["indexing"] == "approaches"

    def test_structured_answer_grading(self) -> None:
        k = sympy.Symbol("k")
        correct_answer = pbo.big_operator_to_json(
            operator="Sum",
            indexing="bounds",
            index=k,
            lower=1,
            upper=4,
            body=k + 1,
        )
        markup = html(**{"answers-name": "total"})
        data = question_data(
            raw_submitted_answers={
                "total-lower": "1",
                "total-upper": "4",
                "total-body": "k + 1",
            }
        )
        data["correct_answers"]["total"] = correct_answer

        prepared = self._prepare_parse_render(markup, data)
        submitted = pl.from_json(prepared["submitted_answers"]["total"])
        correct = pl.from_json(prepared["correct_answers"]["total"])

        assert submitted["indexing"] == "bounds"
        assert correct["indexing"] == "bounds"
        assert submitted["body"] == correct["body"]

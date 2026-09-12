from __future__ import annotations

import doctest
import importlib
import re
import textwrap
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal

import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import pytest
import sympy

big_operator_input = importlib.import_module("pl-big-operator-input")


def inferred_answer(operator: str, indexing: str | None = None) -> str:
    operator = operator[:1].lower() + operator[1:]
    if operator == "limit":
        return "Limit(k, (k, 0, '+-'))"
    function = {
        "sum": "Sum",
        "product": "Product",
        "integral": "Integral",
        "union": "Union",
        "intersection": "Intersection",
        "disjoint-union": "DisjointUnion",
        "min": "Min",
        "max": "Max",
        "custom": "Custom",
    }[operator]
    body = "{k}" if operator in {"union", "intersection", "disjoint-union"} else "k"
    if indexing == "domain" or (
        indexing is None
        and operator in {"union", "intersection", "disjoint-union", "min", "max"}
    ):
        return f"{function}({body}, (k, {{1, 2}}))"
    return f"{function}({body}, (k, 1, 2))"


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
    return {
        "params": {},
        "preferences": {},
        "correct_answers": ({} if correct_answer is None else {"op": correct_answer}),
        "submitted_answers": {},
        "raw_submitted_answers": raw_submitted_answers or {},
        "format_errors": {},
        "partial_scores": {},
        "panel": panel,
        "editable": panel == "question",
    }


def prepare_parse_grade(markup: str, data: dict[str, Any]) -> None:
    big_operator_input.prepare(markup, data)
    big_operator_input.parse(markup, data)
    big_operator_input.grade(markup, data)


type DocumentationLanguage = Literal["python", "html"]


@dataclass(frozen=True)
class DocumentationExample:
    language: DocumentationLanguage
    source: str
    setup_sources: tuple[str, ...]
    line_number: int
    name: str


_DOCTEST_NAME_PATTERN = r"[a-zA-Z0-9_-]+"
_DOCTEST_SEMANTICS_PATTERN = r"(?:: (?P<semantics>before-next|before-each))?"
_DOCUMENTATION_FENCE_RE = re.compile(
    r"^```(?P<language>py(?:thon)?|html)(?P<header>[^\n]*)\n"
    r"(?P<source>.*?)^```$",
    flags=re.DOTALL | re.MULTILINE,
)
_DOCTEST_NAME_ATTRIBUTE_RE = re.compile(
    rf'(?:^|[\s{{])doctest-name=(?P<quote>["\'])'
    rf"(?P<name>{_DOCTEST_NAME_PATTERN})(?P=quote)(?=\s|}})"
)


def _fence_doctest_name(header: str) -> str | None:
    matches = list(_DOCTEST_NAME_ATTRIBUTE_RE.finditer(header))
    if "doctest-name" in header and (
        len(matches) != 1 or re.fullmatch(r"\s*\{.*\}\s*", header) is None
    ):
        raise ValueError(
            "doctest-name must use the fence attribute form "
            '```python {doctest-name="test_name"}```.'
        )
    return matches[0].group("name") if matches else None


def validate_generated_correct_answers(data: dict[str, Any]) -> None:
    assert data["correct_answers"]
    for answer_name, correct_answer in data["correct_answers"].items():
        attributes: dict[str, object] = {"answers-name": answer_name}
        if isinstance(correct_answer, dict):
            operator_latex = correct_answer.get("operator_latex")
            if correct_answer.get("operator") == "custom":
                attributes["operator-latex"] = (
                    operator_latex
                    if isinstance(operator_latex, str)
                    else r"\operatorname{custom}"
                )
                attributes["grading-method"] = "component"
        elif isinstance(correct_answer, str) and re.match(
            r"^\s*Custom\s*\(", correct_answer
        ):
            attributes["operator-latex"] = r"\operatorname{custom}"
            attributes["grading-method"] = "component"

        validation_data = question_data()
        validation_data["correct_answers"][answer_name] = correct_answer
        big_operator_input.prepare(html(**attributes), validation_data)
        pl.json_to_big_operator(validation_data["correct_answers"][answer_name])


def run_documentation_example(
    language: DocumentationLanguage,
    source: str,
    setup_sources: tuple[str, ...],
    filename: str,
) -> None:
    namespace: dict[str, Any] = {}
    for setup_source in setup_sources:
        try:
            exec(compile(setup_source, filename, "exec"), namespace)
        except Exception as e:
            raise RuntimeError(
                f"Error running test setup source:{textwrap.indent(setup_source, '  > ')}"
            ) from e

    data = question_data()
    if language == "python":
        exec(compile(source, filename, "exec"), namespace)
        generate = namespace.get("generate")
        if callable(generate):
            generate(data)
            validate_generated_correct_answers(data)
        return

    generate = namespace.get("generate")
    if callable(generate):
        generate(data)
    big_operator_input.prepare(source, data)
    big_operator_input.parse(source, data)
    big_operator_input.render(source, data)


def documentation_examples(documentation: str) -> list[DocumentationExample]:
    snippets = list(_DOCUMENTATION_FENCE_RE.finditer(documentation))
    snippets_by_start = {snippet.start(): snippet for snippet in snippets}

    hidden_matches = list(
        re.finditer(
            rf"^<!-- doctest-only{_DOCTEST_SEMANTICS_PATTERN}\n"
            r"(?=```py(?:thon)?(?:[ \t{]|$))",
            documentation,
            flags=re.MULTILINE,
        )
    )
    if len(hidden_matches) != len(
        re.findall(r"^<!-- doctest-only", documentation, flags=re.MULTILINE)
    ):
        raise ValueError(
            "doctest-only directives may be standalone or specify before-next or "
            "before-each; names belong in fence attributes."
        )
    hidden_snippets: dict[int, re.Match[str]] = {}
    for directive in hidden_matches:
        snippet = snippets_by_start.get(directive.end())
        if (
            snippet is None
            or re.match(r"\n-->(?:\n|$)", documentation[snippet.end() :]) is None
        ):
            raise ValueError("doctest-only must wrap exactly one Python fence.")
        hidden_snippets[snippet.start()] = directive

    visible_matches = list(
        re.finditer(
            rf"^<!-- doctest-visible{_DOCTEST_SEMANTICS_PATTERN} -->\n+"
            r"(?=```(?:py(?:thon)?|html)(?:[ \t{]|$))",
            documentation,
            flags=re.MULTILINE,
        )
    )
    if len(visible_matches) != len(
        re.findall(r"^<!-- doctest-visible", documentation, flags=re.MULTILINE)
    ):
        raise ValueError(
            "doctest-visible directives may be standalone or specify before-next or "
            "before-each; names belong in fence attributes."
        )
    visible_snippets = {directive.end(): directive for directive in visible_matches}

    examples: list[DocumentationExample] = []
    before_each: list[str] = []
    before_next: list[str] = []
    for snippet in snippets:
        hidden = hidden_snippets.get(snippet.start())
        visible = visible_snippets.get(snippet.start())
        directive = hidden or visible
        semantics = directive.group("semantics") if directive else None
        fence_name = _fence_doctest_name(snippet.group("header"))

        if hidden and semantics:
            if fence_name is not None:
                raise ValueError(
                    "Setup-only doctest blocks cannot have a doctest-name."
                )
            setup_source = snippet.group("source")
            if semantics == "before-each":
                before_each.append(setup_source)
            else:
                before_next.append(setup_source)
            continue

        language: DocumentationLanguage = (
            "python" if snippet.group("language").startswith("py") else "html"
        )
        if visible and semantics and language != "python":
            raise ValueError("Only Python fences can provide doctest setup code.")

        line_number = documentation.count("\n", 0, snippet.start("source")) + 1
        if fence_name is None:
            raise ValueError(
                f"Doctest fence at line {line_number - 1} requires a doctest-name."
            )
        examples.append(
            DocumentationExample(
                language=language,
                source=snippet.group("source"),
                setup_sources=(*before_each, *before_next),
                line_number=line_number,
                name=fence_name,
            )
        )
        before_next.clear()

        if visible and semantics:
            if semantics == "before-each":
                before_each.append(snippet.group("source"))
            else:
                before_next.append(snippet.group("source"))

    if before_next:
        raise ValueError(
            "A before-next doctest block must be followed by another fence."
        )
    example_names = [example.name for example in examples]
    if len(example_names) != len(set(example_names)):
        raise ValueError("Doctest names must be unique.")
    return examples


DOCUMENTATION_PATH = (
    Path(__file__).parents[4] / "docs/elements/pl-big-operator-input.md"
)
DOCUMENTATION_SOURCE = DOCUMENTATION_PATH.read_text()


def _discover_documentation_examples(
    documentation: str,
) -> tuple[list[DocumentationExample], Exception | None]:
    try:
        return documentation_examples(documentation), None
    except Exception as error:
        return [], error


DOCUMENTATION_EXAMPLES, DOCUMENTATION_DISCOVERY_ERROR = (
    _discover_documentation_examples(DOCUMENTATION_SOURCE)
)


class TestConfigurationUnits:
    def test_correct_answer_is_required(self) -> None:
        with pytest.raises(ValueError, match="is required"):
            big_operator_input._config(html())

    def test_custom_operator_requires_latex(self) -> None:
        with pytest.raises(ValueError, match='"operator-latex" is required'):
            big_operator_input._config(
                html(**{"correct-answer": "Custom(k, (k, 1, 2))"})
            )

    def test_direction_input_only_applies_to_limits(self) -> None:
        assert big_operator_input._config(html(operator="limit")).allow_direction_input

        fixed = big_operator_input._config(
            html(operator="limit", **{"allow-limit-direction-input": "false"})
        )
        assert not fixed.allow_direction_input
        assert fixed.direction == "two-sided"

        with pytest.raises(ValueError, match="can only be used"):
            big_operator_input._config(
                html(operator="sum", **{"allow-limit-direction-input": "false"})
            )

    @pytest.mark.parametrize("allowed_blank", ["none", "indices", "body", "all"])
    def test_allowed_blank_values(self, allowed_blank: str) -> None:
        config = big_operator_input._config(
            html(operator="sum", **{"allowed-blank": allowed_blank})
        )

        assert config.allowed_blank == allowed_blank

    @pytest.mark.parametrize(("imaginary_unit", "expected"), [(None, "i"), ("j", "j")])
    def test_imaginary_unit_for_display(
        self, imaginary_unit: str | None, expected: str
    ) -> None:
        config = big_operator_input._config(
            html(
                operator="sum",
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
                operator="sum",
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
        markup = html(operator="sum", **attributes)
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

    def test_inferred_operator_rejects_unsupported_indexing(self) -> None:
        correct_answer = pl.big_operator_to_json(
            operator="limit",  # type: ignore[arg-type]
            indexing="bounds",
            index="k",
            lower="1",
            upper="2",
            body="k",
        )

        with pytest.raises(ValueError, match="does not support"):
            big_operator_input._config(html(), question_data(correct_answer))

    def test_invalid_inferred_limit_direction_is_rejected(self) -> None:
        correct_answer = pl.big_operator_to_json(
            operator="limit",
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
        assert big_operator_input._formatted_direction(("k", "0")) is None
        assert big_operator_input._formatted_direction(("k", "0", "+")) is None
        assert big_operator_input._legacy_limit_call("k + 1") is None
        assert big_operator_input._legacy_limit_call("Limit(k, k, 0)") is None
        assert (
            big_operator_input._legacy_limit_call("Limit(k, k, 0, dir='sideways')")
            is None
        )
        assert (
            big_operator_input._formatted_answer(
                big_operator_input._config(html(operator="sum")), "k + 1"
            )
            is None
        )

    def test_inference_falls_back_for_unformatted_limits(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sympy_json = psu.sympy_to_json(sympy.Limit(sympy.Symbol("k"), "k", 0))

        assert big_operator_input._infer_spec(sympy_json) == (
            "limit",
            "approaches",
            "k",
        )
        assert big_operator_input._infer_spec(object()) == (None, None, None)
        assert (
            big_operator_input._infer_direction("Limit(k, (k, 0, '?'))", "limit")
            is None
        )
        assert (
            big_operator_input._infer_direction("Limit(k, (k, 0, unquoted))", "limit")
            is None
        )
        assert big_operator_input._infer_direction(object(), "limit") is None

        monkeypatch.setattr(
            big_operator_input,
            "_safe_decode",
            lambda _raw: sympy.Limit(sympy.Symbol("k"), "k", 0),
        )
        assert big_operator_input._infer_direction("not a wrapper", "limit") == (
            "from-right"
        )

    def test_binder_normalizes_supported_sympy_objects(self) -> None:
        k = sympy.Symbol("k")
        sum_config = big_operator_input._config(html(operator="sum"))
        product_config = big_operator_input._config(html(operator="product"))
        integral_config = big_operator_input._config(html(operator="integral"))
        limit_config = big_operator_input._config(html(operator="limit"))

        assert (
            big_operator_input._binder(sum_config, sympy.Sum(k, (k, 1, 2))) is not None
        )
        assert (
            big_operator_input._binder(product_config, sympy.Product(k, (k, 1, 2)))
            is not None
        )
        assert (
            big_operator_input._binder(integral_config, sympy.Integral(k, (k, 1, 2)))
            is not None
        )
        assert (
            big_operator_input._binder(limit_config, sympy.Limit(k, k, 0)) is not None
        )

        assert big_operator_input._binder(limit_config, k) is None
        assert (
            big_operator_input._binder(sum_config, sympy.Product(k, (k, 1, 2))) is None
        )
        assert (
            big_operator_input._binder(product_config, sympy.Sum(k, (k, 1, 2))) is None
        )
        assert (
            big_operator_input._binder(integral_config, sympy.Sum(k, (k, 1, 2))) is None
        )
        assert (
            big_operator_input._binder(
                replace(sum_config, operator="custom"), sympy.Sum(k, (k, 1, 2))
            )
            is None
        )

    def test_binder_rejects_malformed_or_mismatched_indexing(self) -> None:
        k = sympy.Symbol("k")
        sum_config = big_operator_input._config(html(operator="sum"))
        domain_config = big_operator_input._config(
            html(**{"correct-answer": "Sum(k, (k, {1, 2}))"})
        )
        domain_sum = sympy.Basic.__new__(
            sympy.Sum, k, sympy.Tuple(k, sympy.FiniteSet(1, 2))
        )

        assert big_operator_input._binder(domain_config, domain_sum) is not None
        with pytest.raises(ValueError, match="exactly one indexing tuple"):
            big_operator_input._binder(sum_config, sympy.Basic.__new__(sympy.Sum, k))
        with pytest.raises(ValueError, match="3-item indexing tuple"):
            big_operator_input._binder(sum_config, domain_sum)
        with pytest.raises(ValueError, match="does not support indexing"):
            big_operator_input._binder(
                replace(domain_config, indexing="approaches"), domain_sum
            )

    @pytest.mark.parametrize(
        ("operator", "source", "match"),
        [
            ("sum", "Sum(k, (k, 1))", "3-item indexing tuple"),
            ("sum", "Sum(INVALID, (k, 1, 2))", "invalid SymPy data"),
            ("sum", "Sum(k, (k, INVALID, 2))", "invalid SymPy data"),
            ("limit", "Limit(k, (k, 0, '?'))", "Limit direction"),
        ],
    )
    def test_formatted_answers_report_specific_invalid_component(
        self, operator: str, source: str, match: str
    ) -> None:
        config = big_operator_input._config(html(operator=operator))

        with pytest.raises(ValueError, match=match):
            big_operator_input._formatted_answer(config, source)


class TestPrepareUnits:
    def test_formatted_complex_answer_uses_either_imaginary_unit(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(j*k, (k, 1, 2))",
            "allow-complex": "true",
            "imaginary-unit-for-display": "i",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = pl.json_to_big_operator(data["correct_answers"]["op"])
        assert answer["body"] == sympy.I * sympy.Symbol("k")

    @pytest.mark.parametrize(
        ("correct_answer", "operator", "indexing", "index"),
        [
            ("Sum(k**2, (k, 1, 4))", "sum", "bounds", "k"),
            ("Product(k, (k, 1, 4))", "product", "bounds", "k"),
            ("Integral(k, (k, 0, 1))", "integral", "bounds", "k"),
            ("Integral(z, (z, Gamma))", "integral", "domain", "z"),
            ("Limit(sin(x) / x, (x, 0, '+'))", "limit", "approaches", "x"),
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
        self, correct_answer: str, operator: str, indexing: str, index: str
    ) -> None:
        markup = html(**{
            "correct-answer": correct_answer,
            "variables": "Gamma",
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
            (sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4)), "sum"),
            (sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4)), "product"),
            (sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1)), "integral"),
        ],
    )
    def test_sympy_json_answers_are_normalized(
        self, correct_answer: sympy.Expr, operator: str
    ) -> None:
        data = question_data(psu.sympy_to_json(correct_answer))

        big_operator_input.prepare(html(), data)

        answer = data["correct_answers"]["op"]
        decoded = pl.json_to_big_operator(answer)
        assert answer["_type"] == "big_operator"
        assert answer["operator"] == operator
        assert decoded["body"] == correct_answer.args[0]
        assert data["params"] == {}

    def test_custom_operator_is_inferred_from_complete_answer(self) -> None:
        markup = html(**{
            "correct-answer": "Custom(k**2, (k, 1, 4))",
            "operator-latex": r"\mathbb{E}",
            "grading-method": "exact",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        answer = data["correct_answers"]["op"]
        assert answer["operator"] == "custom"
        assert "operator_latex" not in answer

    def test_builtin_operator_latex_override_retains_inferred_semantics(self) -> None:
        markup = html(**{
            "correct-answer": "Sum(k**2, (k, 1, 4))",
            "operator-latex": r"\Sigma",
        })
        data = question_data()

        big_operator_input.prepare(markup, data)

        config = big_operator_input._config(markup, data)
        assert config.operator == "sum"
        assert config.operator_latex == r"\Sigma"
        assert data["correct_answers"]["op"]["operator"] == "sum"

    @pytest.mark.parametrize(
        "attribute", ["operator", "index-variable", "indexing", "limit-direction"]
    )
    def test_removed_structural_attributes_are_rejected(self, attribute: str) -> None:
        markup = (
            f'<pl-big-operator-input answers-name="op" correct-answer="Sum(k, (k, 1, 2))" '
            f'{attribute}="sum"></pl-big-operator-input>'
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
                config = big_operator_input._config(html(operator="sum"))
                correct_answer = big_operator_input._canonical(
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

        answer = pl.json_to_big_operator(data["correct_answers"]["op"])
        assert answer["indexing"] == "domain"
        assert answer["domain"] == sympy.Symbol("D")
        assert answer["body"] == sympy.Symbol("A")


class TestParseUnits:
    @pytest.mark.parametrize(
        ("operator", "indexing", "raw", "expected_components"),
        [
            (
                "sum",
                "bounds",
                {"op-lower": "1", "op-upper": "4", "op-body": "k^2"},
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
        data = question_data(raw_submitted_answers={**raw, "op-unused": "99"})

        big_operator_input.parse(html(operator=operator, indexing=indexing), data)

        answer = data["submitted_answers"]["op"]
        assert answer["_type"] == "big_operator"
        assert answer["operator"] == operator
        assert answer["indexing"] == indexing
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

        big_operator_input.parse(html(operator=operator, indexing="domain"), data)

        assert data["submitted_answers"]["op"] is None
        assert data["format_errors"][field] == "This field must be a set."

    @pytest.mark.parametrize(
        ("operator", "indexing", "raw", "field"),
        [
            (
                "sum",
                "bounds",
                {"op-lower": "{1}", "op-upper": "2", "op-body": "k"},
                "op-lower",
            ),
            (
                "sum",
                "bounds",
                {"op-lower": "1", "op-upper": "{2}", "op-body": "k"},
                "op-upper",
            ),
            (
                "limit",
                "approaches",
                {
                    "op-target": "{0}",
                    "op-body": "k",
                    "op-direction": "from-right",
                },
                "op-target",
            ),
            (
                "sum",
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
                operator="union",
                indexing="domain",
                variables="A,D",
            ),
            data,
        )

        answer = pl.json_to_big_operator(data["submitted_answers"]["op"])
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
            html(operator="sum", **{"allowed-blank": allowed_blank}), data
        )

        assert data["submitted_answers"]["op"] == ""
        assert not data.get("format_errors")

    def test_blank_required_fields_have_field_errors(self) -> None:
        data = question_data(
            raw_submitted_answers={"op-lower": "", "op-upper": "", "op-body": ""}
        )

        big_operator_input.parse(html(operator="sum"), data)

        assert data["submitted_answers"]["op"] is None
        assert set(data["format_errors"]) == {"op-lower", "op-upper", "op-body"}

    def test_custom_functions_are_available_in_the_body(self) -> None:
        markup = html(
            operator="sum",
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

        decoded = pl.json_to_big_operator(data["submitted_answers"]["op"])
        assert decoded["body"] == sympy.Function("f")(sympy.Symbol("k")) + sympy.Symbol(
            "x"
        )


class TestGradeUnits:
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

        assert data["correct_answers"]["op"]["operator"] == "custom"

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
        bounds_config = big_operator_input._config(html(operator="sum"))
        limit_config = big_operator_input._config(html(operator="limit"))
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
            replace(bounds_config, operator="custom"), bounds_values
        ) == sympy.Tuple(k, (k, 1, 2))
        assert big_operator_input._construct(
            limit_config, approach_values, "from-right"
        ) == sympy.Limit(1 / k, k, 0, dir="+")
        assert big_operator_input._construct(domain_config, domain_values) == 3
        assert big_operator_input._construct(
            replace(domain_config, operator="custom"), domain_values
        ) == sympy.Tuple(1, 2)
        assert (
            big_operator_input._construct(
                replace(domain_config, operator="max"), domain_values
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
            ("correct", "limit"),
            ("incorrect", "limit"),
            ("invalid", "sum"),
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
        markup = html(operator="sum", **{"allowed-blank": "all"})
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
            ("sum", "bounds", ("op-lower", "op-upper", "op-body"), ("op-domain",)),
            ("union", "domain", ("op-domain", "op-body"), ("op-lower", "op-upper")),
            (
                "limit",
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
            ("sum", "bounds", ("op-lower", "op-upper", "op-body")),
            ("integral", "bounds", ("op-lower", "op-upper", "op-body")),
            ("integral", "domain", ("op-domain", "op-body")),
            ("union", "domain", ("op-domain", "op-body")),
            ("limit", "approaches", ("op-target", "op-direction", "op-body")),
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

    @pytest.mark.parametrize("operator", ["integral", "sum"])
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
        markup = html(operator="sum", display=display)
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
                operator="sum",
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
            html(operator="sum", **{"display-log-as-ln": "true"}),
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
    @pytest.mark.parametrize("operator", ["integral", "union"])
    @pytest.mark.parametrize(
        "indexing", ["bounds", "domain"], ids=["two-bounds", "single-bound"]
    )
    @pytest.mark.parametrize("panel", ["answer", "submission"])
    def test_operator_limit_position(
        self,
        latex_override: bool,
        operator: Literal["integral", "union"],
        indexing: Literal["bounds", "domain"],
        panel: Literal["answer", "submission"],
    ) -> None:
        function_name = "Integral" if operator == "integral" else "Union"
        body = "k" if operator == "integral" else "{k}"
        index_spec = "(k, 0, 1)" if indexing == "bounds" else "(k, gamma)"
        operator_latex = (
            (r"\oint" if operator == "integral" else r"\bigoplus")
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
            ("integral", False): r"\int",
            ("integral", True): r"\mathop{\oint}\nolimits",
            ("union", False): r"\bigcup",
            ("union", True): r"\mathop{\bigoplus}\limits",
        }[operator, latex_override]
        if indexing == "bounds":
            subscript = "0" if operator == "integral" else "k=0"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}^{{1}}"
        else:
            subscript = r"\gamma" if operator == "integral" else r"k\in \gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}"
        suffix = r"\,\mathrm{d}k" if operator == "integral" else ""
        body_tex = "k" if operator == "integral" else r"\left\{k\right\}"

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
    @pytest.mark.parametrize("operator", ["integral", "union"])
    @pytest.mark.parametrize(
        "indexing", ["bounds", "domain"], ids=["two-bounds", "single-bound"]
    )
    def test_submission_formats_valid_component_when_all_others_are_blank(
        self,
        latex_override: bool,
        operator: Literal["integral", "union"],
        indexing: Literal["bounds", "domain"],
    ) -> None:
        function_name = "Integral" if operator == "integral" else "Union"
        body = "k" if operator == "integral" else "{k}"
        index_spec = "(k, 0, 1)" if indexing == "bounds" else "(k, gamma)"
        operator_latex = (
            (r"\oint" if operator == "integral" else r"\bigoplus")
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
            ("integral", False): r"\int",
            ("integral", True): r"\mathop{\oint}\nolimits",
            ("union", False): r"\bigcup",
            ("union", True): r"\mathop{\bigoplus}\limits",
        }[operator, latex_override]
        if indexing == "bounds":
            subscript = r"\gamma" if operator == "integral" else r"k=\gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}^{{}}"
        else:
            subscript = r"\gamma" if operator == "integral" else r"k\in \gamma"
            indexed_operator = rf"{operator_tex}_{{{subscript}}}"

        assert indexed_operator in rendered

    @pytest.mark.parametrize("panel", ["answer", "submission"])
    def test_complete_notation_uses_configured_imaginary_unit(
        self, panel: Literal["answer", "submission"]
    ) -> None:
        base_config = big_operator_input._config(html(operator="sum"))
        correct_answer = big_operator_input._canonical(
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
            "allow-limit-direction-input": "false",
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
        markup = html(operator="sum", **{"grading-method": "component"})
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
            ("sum", "domain"),
            ("union", "bounds"),
            ("limit", "bounds"),
        ],
    )
    def test_structured_answer_indexing_must_match_element(
        self, operator: str, actual_indexing: str
    ) -> None:
        config = big_operator_input._config(html(operator=operator))

        with pytest.raises(ValueError, match="indexing does not match"):
            big_operator_input._decoded_values(
                config,
                {"indexing": actual_indexing},
            )

    def test_internal_decode_rejects_non_mathematical_values(self) -> None:
        expression = sympy.Symbol("k")

        assert big_operator_input._decode(expression) == expression
        assert big_operator_input._safe_decode(object()) is None

        with pytest.raises(TypeError, match="must be SymPy expressions"):
            big_operator_input._decode(object())

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
                html(**{"allow-complex": "false"}),
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
        markup = html(operator="sum")
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


class TestDocumentationPreflight:
    def test_documentation_examples_are_discoverable(self) -> None:
        if DOCUMENTATION_DISCOVERY_ERROR is not None:
            raise DOCUMENTATION_DISCOVERY_ERROR

    def test_failed_discovery_has_no_doctest_parameters(self) -> None:
        examples, error = _discover_documentation_examples(
            "```html\n<pl-big-operator-input />\n```"
        )
        assert error is not None
        assert examples == []

    def test_visible_directive_requires_a_fence_name(self) -> None:
        with pytest.raises(ValueError, match="requires a doctest-name"):
            documentation_examples("<!-- doctest-visible -->\n```python\npass\n```")

    def test_ordinary_fence_requires_a_name(self) -> None:
        with pytest.raises(ValueError, match="requires a doctest-name"):
            documentation_examples("```html\n<pl-big-operator-input />\n```")

    @pytest.mark.parametrize(
        ("documentation", "expected_name"),
        [
            (
                '<!-- doctest-visible -->\n```python {doctest-name="test_visible"}\npass\n```',
                "test_visible",
            ),
            (
                '<!-- doctest-only\n```python {doctest-name="test_hidden"}\npass\n```\n-->',
                "test_hidden",
            ),
            (
                '```html {doctest-name="test_fence_name"}\n<pl-big-operator-input />\n```',
                "test_fence_name",
            ),
        ],
        ids=["visible", "hidden", "ordinary"],
    )
    def test_name_sources(self, documentation: str, expected_name: str) -> None:
        [example] = documentation_examples(documentation)
        assert example.name == expected_name


@pytest.mark.skipif(
    DOCUMENTATION_DISCOVERY_ERROR is not None,
    reason="Documentation example discovery failed.",
)
class TestDocumentationExamples:
    @pytest.mark.parametrize(
        "example",
        [pytest.param(example, id=example.name) for example in DOCUMENTATION_EXAMPLES],
    )
    def test_snippet(self, example: DocumentationExample) -> None:
        test = doctest.DocTest(
            examples=[
                doctest.Example(
                    source="run_example()\n",
                    want="",
                    lineno=example.line_number - 1,
                )
            ],
            globs={
                "run_example": lambda: run_documentation_example(
                    example.language,
                    example.source,
                    example.setup_sources,
                    str(DOCUMENTATION_PATH),
                )
            },
            name=example.name,
            filename=str(DOCUMENTATION_PATH),
            lineno=0,
            docstring=DOCUMENTATION_SOURCE,
        )
        result = doctest.DocTestRunner().run(test)
        assert result.failed == 0

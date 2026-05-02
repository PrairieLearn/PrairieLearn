from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Required, TypeAliasType, TypedDict

from validate import validate

if TYPE_CHECKING:
    from collections.abc import Sequence

MATHJSON_SOURCE_BRANCH = "main"
DEFAULT_DICTIONARY_URL = (
    f"https://raw.githubusercontent.com/arnog/mathjson/{MATHJSON_SOURCE_BRANCH}/"
    "dictionary.json"
)
DEFAULT_CATEGORIES_URL = (
    f"https://raw.githubusercontent.com/arnog/mathjson/{MATHJSON_SOURCE_BRANCH}/"
    "categories.json"
)


class MathJsonOperatorJson(TypedDict, total=False):
    name: Required[str]
    signature: Required[str]


class MathJsonConstantJson(TypedDict, total=False):
    name: Required[str]


class MathJsonDictionaryJson(TypedDict, total=False):
    operators: Required[list[MathJsonOperatorJson]]
    constants: Required[list[MathJsonConstantJson]]


class MathJsonCategoryJson(TypedDict, total=False):
    operators: Required[list[str]]


type MathJsonCategoriesJson = dict[str, MathJsonCategoryJson]


@dataclass(frozen=True)
class FunctionArgument:
    type: str


@dataclass(frozen=True)
class VariadicArgument:
    type: str
    min_count: Literal[0, 1]


@dataclass(frozen=True)
class FunctionSignature:
    args: list[FunctionArgument]
    optional_args: list[FunctionArgument]
    variadic_arg: VariadicArgument | None


def load_json[T](source: str, schema: type[T] | TypeAliasType) -> T:
    if source.startswith(("http://", "https://")):
        with urllib.request.urlopen(source) as response:
            data = json.load(response)
            return validate(data, schema)
    with Path(source).open() as f:
        data = json.load(f)
        return validate(data, schema)


def find_matching_delimiter(value: str, start: int) -> int | None:
    pairs = {"(": ")", "[": "]", "<": ">"}
    opening = value[start]
    closing = pairs[opening]
    depth = 0
    for index, char in enumerate(value[start:], start):
        if char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return index
    return None


def split_top_level(value: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    start = 0
    stack: list[str] = []
    pairs = {"(": ")", "[": "]", "<": ">"}
    closing_to_opening = {closing: opening for opening, closing in pairs.items()}

    for index, char in enumerate(value):
        if char in pairs:
            stack.append(char)
        elif char in closing_to_opening:
            if stack and stack[-1] == closing_to_opening[char]:
                stack.pop()
        elif char == delimiter and not stack:
            parts.append(value[start:index].strip())
            start = index + 1

    parts.append(value[start:].strip())
    return [part for part in parts if part]


def strip_argument_name(value: str) -> str:
    stack: list[str] = []
    pairs = {"(": ")", "[": "]", "<": ">"}
    closing_to_opening = {closing: opening for opening, closing in pairs.items()}

    for index, char in enumerate(value):
        if char in pairs:
            stack.append(char)
        elif char in closing_to_opening:
            if stack and stack[-1] == closing_to_opening[char]:
                stack.pop()
        elif char == ":" and not stack:
            return value[index + 1 :].strip()

    return value


def strip_outer_parentheses(value: str) -> str:
    value = value.strip()
    while value.startswith("("):
        end = find_matching_delimiter(value, 0)
        if end != len(value) - 1:
            break
        value = value[1:-1].strip()
    return value


def parse_function_signature(signature: str) -> FunctionSignature:
    signature = signature.strip()

    if not signature.startswith("("):
        return FunctionSignature([], [], VariadicArgument("expression", 0))

    end = find_matching_delimiter(signature, 0)
    if end is None:
        return FunctionSignature([], [], VariadicArgument("expression", 0))

    args_source = signature[1:end].strip()
    args: list[FunctionArgument] = []
    optional_args: list[FunctionArgument] = []
    variadic_arg: VariadicArgument | None = None

    if not args_source:
        return FunctionSignature(args, optional_args, variadic_arg)

    for raw_arg in split_top_level(args_source, ","):
        arg = raw_arg.strip()
        suffix = ""
        if arg.endswith(("?", "*", "+")):
            suffix = arg[-1]
            arg = arg[:-1].strip()

        arg_type = strip_argument_name(arg)
        if suffix == "?":
            optional_args.append(FunctionArgument(arg_type))
        elif suffix == "*":
            variadic_arg = VariadicArgument(arg_type, 0)
        elif suffix == "+":
            variadic_arg = VariadicArgument(arg_type, 1)
        else:
            args.append(FunctionArgument(arg_type))

    return FunctionSignature(args, optional_args, variadic_arg)


def load_name(name: str) -> ast.Name:
    return ast.Name(id=name, ctx=ast.Load())


def store_name(name: str) -> ast.Name:
    return ast.Name(id=name, ctx=ast.Store())


def subscript(value: ast.expr, args: Sequence[ast.expr]) -> ast.Subscript:
    if len(args) == 1:
        slice_: ast.expr = args[0]
    else:
        slice_ = ast.Tuple(elts=list(args), ctx=ast.Load())
    return ast.Subscript(value=value, slice=slice_, ctx=ast.Load())


def literal_type(values: Sequence[str]) -> ast.expr:
    return subscript(
        load_name("Literal"), [ast.Constant(value=value) for value in values]
    )


def tuple_type(args: Sequence[ast.expr]) -> ast.expr:
    return subscript(load_name("tuple"), args)


def variadic_tuple_type(item_type: ast.expr) -> ast.Starred:
    return ast.Starred(
        value=tuple_type([item_type, ast.Constant(value=Ellipsis)]),
        ctx=ast.Load(),
    )


def union_type(types: Sequence[ast.expr]) -> ast.expr:
    if not types:
        raise ValueError("cannot build an empty union type")

    deduped_types: list[ast.expr] = []
    seen: set[str] = set()
    for type_ in types:
        key = ast.dump(type_)
        if key not in seen:
            deduped_types.append(type_)
            seen.add(key)

    ret = deduped_types[0]
    for type_ in deduped_types[1:]:
        ret = ast.BinOp(left=ret, op=ast.BitOr(), right=type_)
    return ret


def type_alias(name: str, value: ast.expr) -> ast.TypeAlias:
    return ast.TypeAlias(name=store_name(name), type_params=[], value=value)


def annotation(name: str, type_: ast.expr) -> ast.AnnAssign:
    return ast.AnnAssign(
        target=store_name(name), annotation=type_, value=None, simple=1
    )


def typed_dict_class(
    name: str,
    fields: Sequence[tuple[str, ast.expr]],
    *,
    base: str = "TypedDict",
    total: bool | None = None,
) -> ast.ClassDef:
    keywords: list[ast.keyword] = []
    if total is not None:
        keywords.append(ast.keyword(arg="total", value=ast.Constant(value=total)))

    body: list[ast.stmt] = [
        annotation(field_name, field_type) for field_name, field_type in fields
    ]
    if not body:
        body = [ast.Pass()]

    return ast.ClassDef(
        name=name,
        bases=[load_name(base)],
        keywords=keywords,
        body=body,
        decorator_list=[],
        type_params=[],
    )


def sanitized_identifier(value: str) -> str:
    ret = re.sub(r"\W+", "", value)
    if not ret or ret[0].isdigit():
        ret = f"_{ret}"
    return ret


def operator_alias_name(operator_name: str) -> str:
    return f"_MathJson{sanitized_identifier(operator_name)}Expression"


def category_alias_name(category_name: str) -> str:
    return f"_MathJson{sanitized_identifier(category_name)}Expression"


def arity_range(signature: FunctionSignature) -> tuple[int, int | None]:
    min_count = len(signature.args)
    max_count: int | None = len(signature.args) + len(signature.optional_args)
    if signature.variadic_arg is not None:
        min_count += signature.variadic_arg.min_count
        max_count = None
    return min_count, max_count


def map_signature_type(type_: str) -> ast.expr:
    type_ = strip_outer_parentheses(strip_argument_name(type_.strip()))
    union_parts = split_top_level(type_, "|")
    if len(union_parts) > 1:
        return union_type([map_signature_type(part) for part in union_parts])

    if type_ == "symbol":
        return load_name("MathJsonSymbolExpression")

    return load_name("MathJsonExpression")


def tuple_expression_type(operator_name: str, signature: FunctionSignature) -> ast.expr:
    head = literal_type([operator_name])
    required_args = [map_signature_type(arg.type) for arg in signature.args]
    optional_args = [map_signature_type(arg.type) for arg in signature.optional_args]
    variadic_arg = signature.variadic_arg

    alternatives: list[ast.expr] = []
    for optional_count in range(len(optional_args) + 1):
        tuple_args = [head, *required_args, *optional_args[:optional_count]]
        if variadic_arg is not None:
            variadic_type = map_signature_type(variadic_arg.type)
            if variadic_arg.min_count == 1:
                tuple_args.append(variadic_type)
            tuple_args.append(variadic_tuple_type(variadic_type))
        alternatives.append(tuple_type(tuple_args))

    return union_type(alternatives)


def build_module(
    dictionary: MathJsonDictionaryJson,
    categories: MathJsonCategoriesJson,
) -> ast.Module:
    operators = {operator["name"]: operator for operator in dictionary["operators"]}
    constants = [constant["name"] for constant in dictionary["constants"]]
    signatures = {
        operator_name: parse_function_signature(operator["signature"])
        for operator_name, operator in operators.items()
    }
    relation_symbols = {
        operator_name
        for category_name, category in categories.items()
        if sanitized_identifier(category_name) == "RelationalOperators"
        for operator_name in category["operators"]
        if operator_name in operators
    }
    unary_symbols: list[str] = []
    binary_symbols: list[str] = []
    variadic_symbols: list[str] = []
    other_symbols: list[str] = []

    for operator_name, signature in signatures.items():
        min_arity, max_arity = arity_range(signature)
        if operator_name in relation_symbols:
            continue
        if max_arity is None:
            variadic_symbols.append(operator_name)
        elif min_arity == max_arity == 1:
            unary_symbols.append(operator_name)
        elif min_arity == max_arity == 2:
            binary_symbols.append(operator_name)
        else:
            other_symbols.append(operator_name)

    body: list[ast.stmt] = [
        ast.Expr(
            value=ast.Constant(
                value=(
                    "Python type hints mirroring the MathJSON expression types.\n\n"
                    "Do not edit this file directly; run generate_mathjson.py.\n\n"
                    "Generated by generate_mathjson.py from the latest "
                    f"arnog/mathjson {MATHJSON_SOURCE_BRANCH} branch.\n"
                )
            )
        ),
        ast.ImportFrom(
            module="__future__",
            names=[ast.alias(name="annotations")],
            level=0,
        ),
        ast.ImportFrom(
            module="typing",
            names=[
                ast.alias(name="Literal"),
                ast.alias(name="TypedDict"),
            ],
            level=0,
        ),
        type_alias("MathJsonUnaryFunctionSymbol", literal_type(unary_symbols)),
        type_alias("MathJsonBinaryFunctionSymbol", literal_type(binary_symbols)),
        type_alias("MathJsonVariadicFunctionSymbol", literal_type(variadic_symbols)),
        type_alias(
            "MathJsonRelationsFunctionSymbol",
            literal_type([
                operator_name
                for operator_name in operators
                if operator_name in relation_symbols
            ]),
        ),
        type_alias("MathJsonOtherFunctionSymbol", literal_type(other_symbols)),
        type_alias(
            "MathJsonFunctionSymbol",
            union_type([
                load_name("MathJsonUnaryFunctionSymbol"),
                load_name("MathJsonBinaryFunctionSymbol"),
                load_name("MathJsonVariadicFunctionSymbol"),
                load_name("MathJsonRelationsFunctionSymbol"),
                load_name("MathJsonOtherFunctionSymbol"),
            ]),
        ),
        type_alias("MathJsonConstantSymbol", literal_type(constants)),
        type_alias(
            "MathJsonBuiltInSymbol",
            union_type([
                load_name("MathJsonFunctionSymbol"),
                load_name("MathJsonConstantSymbol"),
            ]),
        ),
        type_alias("MathJsonSymbol", load_name("str")),
        typed_dict_class(
            "MathJsonAttributes",
            [
                ("comment", load_name("str")),
                ("documentation", load_name("str")),
                ("latex", load_name("str")),
                ("wikidata", load_name("str")),
                ("wikibase", load_name("str")),
                ("openmathSymbol", load_name("str")),
                ("openmathCd", load_name("str")),
                ("sourceUrl", load_name("str")),
                ("sourceContent", load_name("str")),
                ("sourceOffsets", tuple_type([load_name("int"), load_name("int")])),
            ],
            total=False,
        ),
        typed_dict_class(
            "MathJsonNumberObject",
            [("num", load_name("str"))],
            base="MathJsonAttributes",
        ),
        typed_dict_class(
            "MathJsonSymbolObject",
            [("sym", load_name("MathJsonSymbol"))],
            base="MathJsonAttributes",
        ),
        typed_dict_class(
            "MathJsonStringObject",
            [("str", load_name("str"))],
            base="MathJsonAttributes",
        ),
        type_alias(
            "MathJsonSymbolExpression",
            union_type([load_name("MathJsonSymbolObject"), load_name("str")]),
        ),
    ]

    body.extend(
        type_alias(
            operator_alias_name(operator_name),
            tuple_expression_type(
                operator_name,
                signatures[operator_name],
            ),
        )
        for operator_name in operators
    )

    category_aliases: list[str] = []
    for category_name, category in categories.items():
        operator_aliases = [
            load_name(operator_alias_name(operator_name))
            for operator_name in category["operators"]
            if operator_name in operators
        ]
        if not operator_aliases:
            continue
        alias_name = category_alias_name(category_name)
        category_aliases.append(alias_name)
        body.append(type_alias(alias_name, union_type(operator_aliases)))

    body.extend([
        type_alias(
            "MathJsonFunctionExpression",
            union_type([load_name(name) for name in category_aliases]),
        ),
        typed_dict_class(
            "MathJsonFunctionObject",
            [("fn", load_name("MathJsonFunctionExpression"))],
            base="MathJsonAttributes",
        ),
        type_alias(
            "DictionaryValue",
            union_type([
                load_name("bool"),
                load_name("int"),
                load_name("float"),
                load_name("str"),
                load_name("ExpressionObject"),
                subscript(load_name("list"), [load_name("DictionaryValue")]),
            ]),
        ),
        typed_dict_class(
            "MathJsonDictionaryObject",
            [
                (
                    "dict",
                    subscript(
                        load_name("dict"),
                        [load_name("str"), load_name("DictionaryValue")],
                    ),
                )
            ],
            base="MathJsonAttributes",
        ),
        type_alias(
            "ExpressionObject",
            union_type([
                load_name("MathJsonNumberObject"),
                load_name("MathJsonStringObject"),
                load_name("MathJsonSymbolObject"),
                load_name("MathJsonFunctionObject"),
                load_name("MathJsonDictionaryObject"),
            ]),
        ),
        type_alias(
            "MathJsonExpression",
            union_type([
                load_name("ExpressionObject"),
                load_name("int"),
                load_name("float"),
                load_name("str"),
                load_name("MathJsonFunctionExpression"),
            ]),
        ),
    ])

    module = ast.Module(body=body, type_ignores=[])
    ast.fix_missing_locations(module)
    return module


def generate_mathjson(
    dictionary: MathJsonDictionaryJson,
    categories: MathJsonCategoriesJson,
) -> str:
    return f"{ast.unparse(build_module(dictionary, categories))}\n"


def run_ruff(output: Path, *, check: bool) -> None:
    check_command = ["uv", "run", "ruff", "check"]
    if check:
        check_command.append(str(output))
    else:
        check_command.extend(["--fix", str(output)])
    subprocess.run(check_command, check=True)

    format_command = ["uv", "run", "ruff", "format"]
    if check:
        format_command.append("--check")
    format_command.append(str(output))
    subprocess.run(format_command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dictionary", default=DEFAULT_DICTIONARY_URL)
    parser.add_argument("--categories", default=DEFAULT_CATEGORIES_URL)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("mathjson.py"),
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    source = generate_mathjson(
        load_json(args.dictionary, MathJsonDictionaryJson),
        load_json(args.categories, MathJsonCategoriesJson),
    )

    if args.check:
        output_tree = ast.parse(args.output.read_text())
        generated_tree = ast.parse(source)
        if ast.dump(output_tree) != ast.dump(generated_tree):
            raise SystemExit(f"{args.output} is out of date")
        run_ruff(args.output, check=True)
        return

    args.output.write_text(source)
    run_ruff(args.output, check=False)


if __name__ == "__main__":
    main()

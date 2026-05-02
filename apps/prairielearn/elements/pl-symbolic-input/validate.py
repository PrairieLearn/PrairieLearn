"""TODO: just use pydantic"""

import builtins
import sys
import types
import typing
from itertools import repeat
from typing import (
    Any,
    ForwardRef,
    NotRequired,
    Required,
    TypeAliasType,
    cast,
    get_args,
    get_origin,
    is_typeddict,
)

from typing_extensions import evaluate_forward_ref, get_annotations


def _resolve_type(type_: Any, depth: int = 16) -> Any:
    for _ in repeat(None, depth):
        if isinstance(type_, TypeAliasType):
            type_ = type_.__value__
        elif isinstance(type_, ForwardRef):
            module_name = type_.__forward_module__
            globals_ = (
                vars(sys.modules[module_name])
                if module_name is not None and module_name in sys.modules
                else None
            )
            type_ = evaluate_forward_ref(
                type_,
                globals=globals_,
                owner=getattr(type_, "__owner__", None),
            )
        else:
            return type_
    raise ValueError(f"too many levels to resolve for type: {type_}")


def _is_unpacked_variadic_tuple(type_: Any) -> bool:
    args = get_args(type_)
    return (
        getattr(type_, "__unpacked__", False)
        and get_origin(type_) is builtins.tuple
        and len(args) == 2
        and args[1] is Ellipsis
    )


def validate[T](instance: Any, schema: type[T] | TypeAliasType) -> T:
    """Validate and normalize a value against a Python type annotation.

    This intentionally covers only the type constructs needed by the local
    MathJSON code: `TypedDict`, `Required`/`NotRequired`, unions, literals,
    annotated types, dictionaries, lists, tuples, sets, forward references, and
    Python 3.12+ type aliases. Container values are validated recursively.

    Examples:
        ``validate(["Add", "x", 1], MathJsonExpression)`` returns
        ``("Add", "x", 1)`` because MathJSON function expressions are typed as
        tuples, and JSON arrays arrive as lists.

    Args:
        instance: The value to validate.
        schema: The Python type annotation to validate against.

    Returns:
        The validated value, with recursive container normalization applied.
        Lists are converted to tuples when the schema expects a tuple.

    Raises:
        TypeError: If a value does not match the expected runtime type.
        ValueError: If a value has the right container type but invalid
            contents, length, literal value, required keys, or schema shape, or
            if type alias / forward reference resolution exceeds the max depth
            guard.
    """
    type_ = _resolve_type(schema)

    if is_typeddict(type_):
        if not isinstance(instance, dict):
            raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")

        ret = dict(instance)
        for key, raw_annotation in get_annotations(type_).items():
            annotation = _resolve_type(raw_annotation)
            origin = get_origin(annotation)
            is_optional = key in type_.__optional_keys__ or origin is NotRequired
            if origin in {NotRequired, Required}:
                annotation = get_args(annotation)[0]
            if key in instance:
                ret[key] = validate(instance[key], annotation)
            elif not is_optional:
                raise ValueError(f"missing required key: {key}")
        return cast(T, ret)

    origin = get_origin(type_)
    args = get_args(type_)

    match origin:
        case None:
            if not isinstance(instance, type_):
                raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")
        case typing.Union | types.UnionType:
            for arg in args:
                try:
                    return validate(instance, arg)
                except (TypeError, ValueError):
                    continue
            raise TypeError(
                f"invalid type: expected one of {args}, got {type(instance)}"
            )
        case typing.Literal:
            if instance not in args:
                raise ValueError(
                    f"invalid value: expected one of {args}, got {instance}"
                )
        case typing.Annotated:
            return validate(instance, args[0])
        case builtins.dict:
            if not isinstance(instance, dict):
                raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")
            key_type, val_type = args
            return cast(
                T,
                {
                    validate(k, key_type): validate(v, val_type)
                    for k, v in instance.items()
                },
            )
        case builtins.list:
            if not isinstance(instance, list):
                raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")
            item_type = args[0]
            return cast(T, [validate(v, item_type) for v in instance])
        # NOTE: this accepts lists and casts them to tuples
        case builtins.tuple:
            if not isinstance(instance, list | tuple):
                raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")

            if len(args) == 2 and args[1] is Ellipsis:
                return cast(T, tuple(validate(v, args[0]) for v in instance))

            unpacked_variadic_tuple_args = [
                i for i, arg in enumerate(args) if _is_unpacked_variadic_tuple(arg)
            ]
            if len(unpacked_variadic_tuple_args) > 1:
                raise ValueError(f"unsupported tuple type: {type_}")
            if len(unpacked_variadic_tuple_args) == 1:
                unpacked_index = unpacked_variadic_tuple_args[0]
                prefix_args = args[:unpacked_index]
                suffix_args = args[unpacked_index + 1 :]
                variadic_type = get_args(args[unpacked_index])[0]

                if len(instance) < len(prefix_args) + len(suffix_args):
                    raise ValueError(
                        f"invalid tuple length: expected at least {len(prefix_args) + len(suffix_args)}, got {len(instance)}"
                    )

                prefix = [
                    validate(v, item_type)
                    for v, item_type in zip(
                        instance[: len(prefix_args)], prefix_args, strict=True
                    )
                ]
                middle = [
                    validate(v, variadic_type)
                    for v in instance[
                        len(prefix_args) : len(instance) - len(suffix_args)
                    ]
                ]
                suffix = [
                    validate(v, item_type)
                    for v, item_type in zip(
                        instance[len(instance) - len(suffix_args) :],
                        suffix_args,
                        strict=True,
                    )
                ]
                return cast(T, (*prefix, *middle, *suffix))

            if Ellipsis in args:
                raise ValueError(f"unsupported tuple type: {type_}")

            if len(instance) != len(args):
                raise ValueError(
                    f"invalid tuple length: expected {len(args)}, got {len(instance)}"
                )
            return cast(
                T,
                tuple(
                    validate(v, item_type)
                    for v, item_type in zip(instance, args, strict=True)
                ),
            )
        case builtins.set:
            if not isinstance(instance, set):
                raise TypeError(f"invalid type: expected {type_}, got {type(instance)}")
            item_type = args[0]
            ret = set()
            len_orig = len(instance)
            ret.update(validate(v, item_type) for v in instance)
            if len(ret) != len_orig:
                raise ValueError("invalid set: duplicate items found")
            return cast(T, ret)
        case _:
            raise ValueError(f"unsupported type: {type_}")

    return cast(T, instance)

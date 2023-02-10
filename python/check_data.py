from typing import Any, Dict, List, Literal, TypedDict

Phase = Literal["generate", "prepare", "render", "parse", "grade", "test", "file"]

ValueType = Literal["boolean", "integer", "number", "string", "object"]

all_phases: List[Phase] = [
    "generate",
    "prepare",
    "render",
    "parse",
    "grade",
    "test",
    "file",
]


class PropInfo(TypedDict):
    type: ValueType
    present_phases: List[Phase]
    edit_phases: List[Phase]


PROPS: Dict[str, PropInfo] = {
    "params": {
        "type": "object",
        "present_phases": all_phases,
        "edit_phases": ["generate", "prepare", "grade"],
    },
    "correct_answers": {
        "type": "object",
        "present_phases": all_phases,
        "edit_phases": ["generate", "prepare", "parse", "grade"],
    },
    "variant_seed": {
        "type": "integer",
        "present_phases": all_phases,
        "edit_phases": [],
    },
    "options": {
        "type": "object",
        "present_phases": all_phases,
        "edit_phases": [],
    },
    "submitted_answers": {
        "type": "object",
        "present_phases": ["render", "parse", "grade"],
        "edit_phases": ["parse", "grade"],
    },
    "format_errors": {
        "type": "object",
        "present_phases": ["render", "parse", "grade", "test"],
        "edit_phases": ["parse", "grade", "test"],
    },
    "raw_submitted_answers": {
        "type": "object",
        "present_phases": ["render", "parse", "grade", "test"],
        "edit_phases": ["test"],
    },
    "partial_scores": {
        "type": "object",
        "present_phases": ["render", "grade", "test"],
        "edit_phases": ["grade", "test"],
    },
    "score": {
        "type": "number",
        "present_phases": ["render", "grade", "test"],
        "edit_phases": ["grade", "test"],
    },
    "feedback": {
        "type": "object",
        "present_phases": ["render", "grade", "test"],
        "edit_phases": ["grade", "test"],
    },
    "editable": {
        "type": "boolean",
        "present_phases": ["render"],
        "edit_phases": [],
    },
    "manual_grading": {
        "type": "boolean",
        "present_phases": ["render"],
        "edit_phases": [],
    },
    "panel": {
        "type": "string",
        "present_phases": ["render"],
        "edit_phases": [],
    },
    "num_valid_submissions": {
        "type": "integer",
        "present_phases": ["render"],
        "edit_phases": [],
    },
    "gradable": {
        "type": "boolean",
        "present_phases": ["parse", "grade", "test"],
        "edit_phases": [],
    },
    "filename": {
        "type": "string",
        "present_phases": ["file"],
        "edit_phases": [],
    },
    "test_type": {
        "type": "string",
        "present_phases": ["test"],
        "edit_phases": [],
    },
    "extensions": {
        "type": "object",
        "present_phases": all_phases,
        "edit_phases": [],
    },
}


def check_prop(
    prop: str,
    old_value: Any,
    new_value: Any,
    value_type: ValueType,
    present_phases: List[Phase],
    edit_phases: List[Phase],
    phase: Phase,
) -> None:
    # First, validate the type
    if value_type == "integer" and not isinstance(new_value, int):
        raise ValueError(f"Expected data.{prop} to be an integer")
    elif value_type == "string" and not isinstance(new_value, str):
        raise ValueError(f"Expected data.{prop} to be a string")
    elif value_type == "number" and not isinstance(new_value, (int, float)):
        raise ValueError(f"Expected data.{prop} to be a number")
    elif value_type == "boolean" and not isinstance(new_value, bool):
        raise ValueError(f"Expected data.{prop} to be a boolean")
    elif value_type == "object" and not isinstance(new_value, dict):
        raise ValueError(f"Expected data.{prop} to be an object")

    if phase not in edit_phases and old_value != new_value:
        raise ValueError(f"data.{prop} has been illegally modified")


def check_data(old_data: dict, new_data: dict, phase: Phase) -> None:
    # First, check for extra keys on `new_data`.
    extra_keys = set(new_data.keys()) - set(PROPS.keys())
    if extra_keys:
        extra_keys_str = ", ".join(extra_keys)
        raise ValueError(f"data contains extra keys: {extra_keys_str}")

    # Then, check for missing keys on `new_data`.
    missing_keys = set(old_data.keys()) - set(new_data.keys())
    if missing_keys:
        missing_keys_str = ", ".join(missing_keys)
        raise ValueError(f"data is missing keys: {missing_keys_str}")

    # Validate each entry in `new_data`.
    for key, new_value in new_data.items():
        prop_info = PROPS[key]
        old_value = old_data.get(key, None)
        check_prop(
            key,
            old_value,
            new_value,
            prop_info["type"],
            prop_info["present_phases"],
            prop_info["edit_phases"],
            phase,
        )

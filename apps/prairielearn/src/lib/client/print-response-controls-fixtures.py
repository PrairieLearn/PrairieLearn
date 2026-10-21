"""Render the elements used by the print response controls tests."""

import importlib
import json
import re
import sys
from pathlib import Path
from typing import Any

app_path = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(app_path / "python"))
question_phases = importlib.import_module("prairielearn.internal.question_phases")

fixtures = {
    "variable_output": "<pl-variable-output></pl-variable-output>",
    "multiple_choice_dropdown": (
        '<pl-multiple-choice answers-name="choice" display="dropdown" order="fixed">'
        '<pl-answer correct="true">&lt;em&gt;Literal label&lt;/em&gt;</pl-answer>'
        '<pl-answer correct="false"><strong>Styled label</strong></pl-answer>'
        "</pl-multiple-choice>"
    ),
    "dropdown": (
        '<pl-dropdown answers-name="association" sort="fixed">'
        '<pl-answer correct="true">Positive association</pl-answer>'
        "<pl-answer>Negative association</pl-answer>"
        "</pl-dropdown>"
    ),
    "inputs": (
        '<p>Force: <pl-number-input answers-name="force" correct-answer="10" '
        'comparison="sigfig" digits="3" suffix="N"></pl-number-input></p>'
        '<p>Derivative: <pl-symbolic-input answers-name="derivative" '
        'correct-answer="x^2" variables="x"></pl-symbolic-input></p>'
    ),
    "matrix": (
        '<pl-matrix-component-input answers-name="matrix" rows="1" columns="2" '
        'label="A ="></pl-matrix-component-input>'
    ),
    "image_capture": '<pl-image-capture file-name="solution.jpg"></pl-image-capture>',
    "order_blocks": (
        '<pl-order-blocks answers-name="blocks" source-blocks-order="ordered" '
        'grading-method="dag" indentation="true">'
        '<pl-answer correct="true" tag="first" initially-placed="true">Given</pl-answer>'
        '<pl-answer correct="true" tag="second" depends="first">First</pl-answer>'
        '<pl-answer correct="false" distractor-for="second">Alternative one</pl-answer>'
        '<pl-answer correct="false" distractor-for="second">Alternative two</pl-answer>'
        '<pl-answer correct="true" tag="third" depends="second">Last</pl-answer>'
        "</pl-order-blocks>"
    ),
    "order_blocks_unindented": (
        '<pl-order-blocks answers-name="blocks" source-blocks-order="ordered" '
        'grading-method="ordered">'
        '<pl-answer correct="true">First</pl-answer>'
        '<pl-answer correct="true">Second</pl-answer>'
        "</pl-order-blocks>"
    ),
    "matching": (
        '<pl-matching answers-name="elements">'
        '<pl-statement match="Fe">Iron</pl-statement>'
        '<pl-statement match="Na">Sodium</pl-statement>'
        "<pl-option>Ag</pl-option>"
        "</pl-matching>"
    ),
    "multiple_choice_radio": (
        '<pl-multiple-choice answers-name="choice" order="fixed">'
        '<pl-answer correct="true">Choice A</pl-answer>'
        '<pl-answer correct="false">Choice B</pl-answer>'
        "</pl-multiple-choice>"
    ),
    "checkbox_fieldset": (
        '<pl-checkbox answers-name="choices" order="fixed">'
        '<pl-answer correct="true">First</pl-answer>'
        '<pl-answer correct="false">Second</pl-answer>'
        "</pl-checkbox>"
    ),
    "checkbox_inline": (
        '<pl-checkbox answers-name="choices" order="fixed" display="inline">'
        '<pl-answer correct="true">First</pl-answer>'
        '<pl-answer correct="false">Second</pl-answer>'
        "</pl-checkbox>"
    ),
    "file_editor": (
        '<pl-file-editor file-name="answer.py">'
        'def greet():\n    return "café"\n'
        "</pl-file-editor>"
    ),
    "rich_text": '<pl-rich-text-editor min-word-count="20"></pl-rich-text-editor>',
}

elements_path = app_path / "elements"
rendered = {}
for name, html in fixtures.items():
    tags = set(re.findall(r"<(pl-[a-z-]+)\b", html))
    elements = {
        tag: {"name": tag, "controller": f"{tag}.py", "type": "core"}
        for tag in tags
        if (elements_path / tag / f"{tag}.py").is_file()
    }
    context = {
        "html": html,
        "elements": elements,
        "element_extensions": {},
        "course_path": str(app_path.parents[1] / "testCourse"),
    }
    data: dict[str, Any] = {
        "panel": "question",
        "editable": True,
        "ai_grading": False,
        "params": {"example": 2},
        "correct_answers": {},
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "answers_names": {},
        "options": {
            "course_element_files_url": "/elements",
            "course_element_extension_files_url": "/extensions",
        },
    }
    question_phases.process("prepare", data, context)
    if name == "multiple_choice_radio":
        data["submitted_answers"]["choice"] = data["params"]["choice"][0]["key"]
    if name == "checkbox_fieldset":
        data["submitted_answers"]["choices"] = [data["params"]["choices"][0]["key"]]
    rendered[name], _ = question_phases.process("render", data, context)

print(json.dumps(rendered))

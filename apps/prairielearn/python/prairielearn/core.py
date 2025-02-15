"""Utilities for building questions and elements in PrairieLearn.

```python
from prairielearn import ...
```
"""

import collections
import html
import importlib
import importlib.util
import itertools as it
import math
import os
import random
import re
import string
import uuid
from collections import namedtuple
from collections.abc import Callable, Generator
from types import ModuleType
from typing import Any, Literal, TypedDict, TypeVar

import lxml.html
from pint import UnitRegistry
from typing_extensions import NotRequired, assert_never


class PartialScore(TypedDict):
    """A class with type signatures for the partial scores dict.

    For more information see the [element developer guide](../../devElements.md).
    """

    score: float | None
    weight: NotRequired[int]
    feedback: NotRequired[str | dict[str, str] | Any]


# TODO: This type definition should not yet be seen as authoritative, it may
# need to be modified as we expand type checking to cover more of the element code.
# The fields below containing 'Any' in the types are ones which are used
# in different ways by different question elements. Ideally we would have
# QuestionData be a generic type so that question elements could declare types
# for their answer data, feedback data, etc., but TypedDicts with Generics are
# not yet supported: https://bugs.python.org/issue44863
class QuestionData(TypedDict):
    """A class with type signatures for the data dictionary.

    For more information see the [element developer guide](../../devElements.md).
    """

    params: dict[str, Any]
    correct_answers: dict[str, Any]
    submitted_answers: dict[str, Any]
    format_errors: dict[str, Any]
    partial_scores: dict[str, PartialScore]
    score: float
    feedback: dict[str, Any]
    variant_seed: str
    options: dict[str, Any]
    raw_submitted_answers: dict[str, Any]
    editable: bool
    panel: Literal["question", "submission", "answer"]
    extensions: dict[str, Any]
    num_valid_submissions: int
    manual_grading: bool
    answers_names: dict[str, bool]


class ElementTestData(QuestionData):
    test_type: Literal["correct", "incorrect", "invalid"]


def check_answers_names(data: QuestionData, name: str) -> None:
    """Check that answers names are distinct using property in data dict."""
    if name in data["answers_names"]:
        raise KeyError(f'Duplicate "answers-name" attribute: "{name}"')
    data["answers_names"][name] = True


def get_unit_registry() -> UnitRegistry:
    """Get a unit registry using cache folder valid on production machines."""
    pid = os.getpid()
    cache_dir = f"/tmp/pint_{pid}"
    return UnitRegistry(cache_folder=cache_dir)


def grade_answer_parameterized(
    data: QuestionData,
    question_name: str,
    grade_function: Callable[[Any], tuple[bool | float, str | None]],
    weight: int = 1,
) -> None:
    """
    Grade question question_name. grade_function should take in a single parameter
    (which will be the submitted answer) and return a 2-tuple:
        - The first element of the 2-tuple should either be:
            - a boolean indicating whether the question should be marked correct
            - a partial score between 0 and 1, inclusive
        - The second element of the 2-tuple should either be:
            - a string containing feedback
            - None, if there is no feedback (usually this should only occur if the answer is correct)
    """
    # Create the data dictionary at first
    data["partial_scores"][question_name] = {"score": 0.0, "weight": weight}

    # If there is no submitted answer, we shouldn't do anything. Issues with blank
    # answers should be handled in parse.
    if question_name not in data["submitted_answers"]:
        return

    submitted_answer = data["submitted_answers"][question_name]

    # Run passed-in grading function
    result, feedback_content = grade_function(submitted_answer)

    # Try converting partial score
    if isinstance(result, bool):
        partial_score = 1.0 if result else 0.0
    elif isinstance(result, float | int):
        assert 0.0 <= result <= 1.0
        partial_score = result
    else:
        assert_never(result)

    # Set corresponding partial score and feedback
    data["partial_scores"][question_name]["score"] = partial_score

    if feedback_content:
        data["partial_scores"][question_name]["feedback"] = feedback_content


def determine_score_params(
    score: float,
) -> tuple[Literal["correct", "partial", "incorrect"], bool | float]:
    """
    Determine appropriate key and value for display on the frontend given the
    score for a particular question. For elements following PrairieLearn
    conventions, the return value can be used as a key/value pair in the
    dictionary passed to an element's Mustache template to display a score badge.
    """
    if score >= 1:
        return ("correct", True)
    elif score > 0:
        return ("partial", math.floor(score * 100))

    return ("incorrect", True)


def set_weighted_score_data(data: QuestionData, weight_default: int = 1) -> None:
    """
    Set overall question score to be weighted average of all partial scores. Use
    weight_default to fill in a default weight for a score if one is missing.
    """
    weight_total = 0
    score_total = 0.0
    for part in data["partial_scores"].values():
        score = part["score"]
        weight = part.get("weight", weight_default)

        if score is None:
            raise ValueError("Can't set weighted score data if score is None.")

        score_total += score * weight
        weight_total += weight

    data["score"] = score_total / weight_total


def set_all_or_nothing_score_data(data: QuestionData) -> None:
    """Give points to main question score if all partial scores are correct."""
    data["score"] = 1.0 if all_partial_scores_correct(data) else 0.0


def all_partial_scores_correct(data: QuestionData) -> bool:
    """Return true if all questions are correct in partial scores and it's nonempty."""
    partial_scores = data["partial_scores"]

    if len(partial_scores) == 0:
        return False

    return all(
        part["score"] is not None and math.isclose(part["score"], 1.0)
        for part in partial_scores.values()
    )


def inner_html(element: lxml.html.HtmlElement) -> str:
    inner = element.text
    if inner is None:
        inner = ""
    inner = html.escape(str(inner))
    for child in element:
        inner += lxml.html.tostring(child, method="html").decode("utf-8")
    return inner


def get_uuid() -> str:
    """
    Return the string representation of a new random UUID.
    First character of this uuid is guaranteed to be an alpha
    (at the expense of a slight loss in randomness).

    This is done because certain web components need identifiers to
    start with letters and not numbers.
    """
    uuid_string = str(uuid.uuid4())
    random_char = random.choice("abcdef")

    return random_char + uuid_string[1:]


def clean_identifier_name(name: str) -> str:
    """Escapes a string so that it becomes a valid Python identifier."""
    # Strip invalid characters and weird leading characters so we have
    # a decent python identifier
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    name = re.sub(r"^[^a-zA-Z]+", "", name)
    return name


def load_extension(data: QuestionData, extension_name: str) -> Any:
    """
    Load a single specific extension by name for an element.
    Returns a dictionary of defined variables and functions.
    """
    if "extensions" not in data:
        raise ValueError("load_extension() must be called from an element!")
    if extension_name not in data["extensions"]:
        raise ValueError(f"Could not find extension {extension_name}!")

    ext_info = data["extensions"][extension_name]
    if "controller" not in ext_info:
        # Nothing to load, just return an empty dict
        return {}

    T = TypeVar("T")

    # wrap extension functions so that they execute in their own directory
    def wrap(f: Callable[..., T]) -> Callable[..., T]:
        # If not a function, just return
        if not callable(f):
            return f

        def wrapped_function(*args: Any, **kwargs: Any) -> T:
            old_wd = os.getcwd()
            os.chdir(ext_info["directory"])
            ret_val = f(*args, **kwargs)
            os.chdir(old_wd)
            return ret_val

        return wrapped_function

    # Load any Python functions and variables from the defined controller
    script = os.path.join(ext_info["directory"], ext_info["controller"])
    loaded = {}
    spec = importlib.util.spec_from_file_location(f"{extension_name}-{script}", script)
    if not spec or not spec.loader:
        raise ValueError(f"Could not load extension {extension_name}-{script}!")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Filter out extra names so we only get user defined functions and variables
    loaded = {
        f: wrap(module.__dict__[f]) for f in module.__dict__ if not f.startswith("__")
    }

    # Return functions and variables as a namedtuple, so we get the nice dot access syntax
    module_tuple = namedtuple(clean_identifier_name(extension_name), loaded.keys())  # noqa: PYI024 # pyright: ignore[reportUntypedNamedTuple]
    return module_tuple(**loaded)


def load_all_extensions(data: QuestionData) -> dict[str, Any]:
    """
    Load all available extensions for a given element.
    Returns an ordered dictionary mapping the extension name to its defined variables and functions
    """
    if "extensions" not in data:
        raise ValueError("load_all_extensions() must be called from an element!")
    if len(data["extensions"]) == 0:
        return {}

    loaded_extensions = collections.OrderedDict()
    for name in sorted(data["extensions"].keys()):
        loaded_extensions[name] = load_extension(data, name)

    return loaded_extensions


def load_host_script(script_name: str) -> ModuleType:
    """Small convenience function to load a host element script from an extension."""
    # Chop off the file extension because it's unnecessary here
    script_name = script_name.removesuffix(".py")
    return __import__(script_name)


def iter_keys() -> Generator[str, None, None]:
    """
    from:
    https://stackoverflow.com/questions/29351492/how-to-make-a-continuous-alphabetic-list-python-from-a-z-then-from-aa-ab-ac-e/29351603#29351603
    """
    ascii_set = string.ascii_lowercase

    return (
        "".join(s) for size in it.count(1) for s in it.product(ascii_set, repeat=size)
    )


def index2key(i: int) -> str:
    """
    Use when generating ordered lists of the form ['a', 'b', ..., 'z', 'aa', 'ab', ..., 'zz', 'aaa', 'aab', ...]

    Returns alphabetic key in the form [a-z]* from a given integer (i = 0, 1, 2, ...).
    """
    return next(it.islice(iter_keys(), i, None))


def add_files_format_error(data: QuestionData, error: str) -> None:
    """Add a format error to the data dictionary."""
    if data["format_errors"].get("_files") is None:
        data["format_errors"]["_files"] = []
    if isinstance(data["format_errors"]["_files"], list):
        data["format_errors"]["_files"].append(error)
    else:
        data["format_errors"]["_files"] = [
            '"_files" was present in "format_errors" but was not an array',
            error,
        ]


def add_submitted_file(
    data: QuestionData,
    file_name: str,
    base64_contents: str,
) -> None:
    """Add a submitted file to the data dictionary."""
    if data["submitted_answers"].get("_files") is None:
        data["submitted_answers"]["_files"] = []
    if isinstance(data["submitted_answers"]["_files"], list):
        data["submitted_answers"]["_files"].append({
            "name": file_name,
            "contents": base64_contents,
        })
    else:
        add_files_format_error(
            data, '"_files" is present in "submitted_answers" but is not an array'
        )

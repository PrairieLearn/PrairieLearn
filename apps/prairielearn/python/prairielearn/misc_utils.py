"""Miscellaneous utilities for building questions and elements in PrairieLearn.

```python
from prairielearn import ... # recommended
from prairielearn.misc_utils import ... # unstable, not recommended
```
"""

import html
import itertools as it
import os
import random
import re
import string
import uuid
from collections.abc import Generator
from typing import Any, Literal, TypedDict

import lxml.html
from pint import UnitRegistry
from typing_extensions import NotRequired

from prairielearn.unicode_utils import escape_unicode_string


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


def get_unit_registry() -> UnitRegistry:
    """Get a unit registry using cache folder valid on production machines."""
    pid = os.getpid()
    cache_dir = f"/tmp/pint_{pid}"
    return UnitRegistry(cache_folder=cache_dir)


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


def escape_invalid_string(string: str) -> str:
    """Wrap and escape string in `<code>` tags."""
    return f'<code class="user-output-invalid">{html.escape(escape_unicode_string(string))}</code>'


def clean_identifier_name(name: str) -> str:
    """Escapes a string so that it becomes a valid Python identifier."""
    # Strip invalid characters and weird leading characters so we have
    # a decent python identifier
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    name = re.sub(r"^[^a-zA-Z]+", "", name)
    return name


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

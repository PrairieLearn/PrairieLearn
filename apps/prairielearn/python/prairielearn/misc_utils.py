"""Miscellaneous utilities.

```python
from prairielearn import ...
```
"""

import itertools as it
import os
import random
import string
import unicodedata
import uuid
from collections.abc import Callable, Generator, Iterable
from typing import TypeVar

from pint import UnitRegistry
from text_unidecode import unidecode


def iter_keys() -> Generator[str, None, None]:
    """A continuous alphabetic list of the form `['a', 'b', ..., 'z', 'aa', 'ab', ..., 'zz', 'aaa', 'aab', ...]`.

    <https://stackoverflow.com/questions/29351492/how-to-make-a-continuous-alphabetic-list-python-from-a-z-then-from-aa-ab-ac-e/29351603#29351603>

    Returns:
        A generator that yields strings in the specified format.
    """
    ascii_set = string.ascii_lowercase

    return (
        "".join(s) for size in it.count(1) for s in it.product(ascii_set, repeat=size)
    )


def index2key(i: int) -> str:
    """
    Use when generating ordered lists of the form `['a', 'b', ..., 'z', 'aa', 'ab', ..., 'zz', 'aaa', 'aab', ...]`

    Returns:
        Alphabetic key in the form `[a-z]*` from a given integer (i = 0, 1, 2, ...).
    """
    return next(it.islice(iter_keys(), i, None))


def get_unit_registry() -> UnitRegistry:
    """Get a unit registry using cache folder valid on production machines.

    <https://pint.readthedocs.io/en/stable/index.html>

    Returns:
        A process-specific unit registry.
    """
    pid = os.getpid()
    cache_dir = f"/tmp/pint_{pid}"
    return UnitRegistry(cache_folder=cache_dir)


def full_unidecode(input_str: str) -> str:
    """Do unidecode of input and replace the unicode minus with the normal one.

    Returns:
        A fully decoded string without unicode characters.
    """
    return unidecode(input_str.replace("\u2212", "-"))


def escape_unicode_string(string: str) -> str:
    """Replace invisible/unprintable characters with a text representation of their hex id: `<U+xxxx>`

    A character is considered invisible if its category is "control" or "format", as
    reported by the 'unicodedata' library.

    More info on unicode categories:
    <https://en.wikipedia.org/wiki/Unicode_character_property#General_Category>

    Returns:
        A string with invisible characters replaced
    """

    def escape_unprintable(x: str) -> str:
        category = unicodedata.category(x)
        if category in ("Cc", "Cf"):
            return f"<U+{ord(x):x}>"
        else:
            return x

    return "".join(map(escape_unprintable, string))


def get_uuid() -> str:
    """Return the string representation of a new random UUID.
    First character of this uuid is guaranteed to be an alpha
    (at the expense of a slight loss in randomness).

    This is done because certain web components need identifiers to
    start with letters and not numbers.

    Returns:
        A UUID starting with an alpha char
    """
    uuid_string = str(uuid.uuid4())
    random_char = random.choice("abcdef")

    return random_char + uuid_string[1:]


ListItem = TypeVar("ListItem")


def partition(
    data: Iterable[ListItem], pred: Callable[[ListItem], bool]
) -> tuple[list[ListItem], list[ListItem]]:
    """Implement a partition function, splitting the data into two lists based on the predicate.

    Returns:
        A tuple with two lists, the first containing items that satisfy the predicate,
        and the second containing items that do not.

    Example:
        >>> numbers = [1, 2, 3, 4, 5]
        >>> evens, odds = partition(numbers, lambda x: x % 2 == 0)
        >>> evens
        [2, 4]
        >>> odds
        [1, 3, 5]
    """
    yes, no = [], []
    for d in data:
        if pred(d):
            yes.append(d)
        else:
            no.append(d)
    return (yes, no)

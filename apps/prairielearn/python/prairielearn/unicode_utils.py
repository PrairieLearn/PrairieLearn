"""Utilities for working with unicode strings.Miscellaneous utilities for building questions and elements in PrairieLearn.

```python
from prairielearn import ... # recommended
from prairielearn.unicode_utils import ... # unstable, not recommended
```
"""

import unicodedata

from text_unidecode import unidecode


def full_unidecode(input_str: str) -> str:
    """Do unidecode of input and replace the unicode minus with the normal one."""
    return unidecode(input_str.replace("\u2212", "-"))


def escape_unicode_string(string: str) -> str:
    """
    Replace invisible/unprintable characters with a
    text representation of their hex id: <U+xxxx>

    A character is considered invisible if its category is "control" or "format", as
    reported by the 'unicodedata' library.

    More info on unicode categories:
    https://en.wikipedia.org/wiki/Unicode_character_property#General_Category
    """

    def escape_unprintable(x: str) -> str:
        category = unicodedata.category(x)
        if category in ("Cc", "Cf"):
            return f"<U+{ord(x):x}>"
        else:
            return x

    return "".join(map(escape_unprintable, string))

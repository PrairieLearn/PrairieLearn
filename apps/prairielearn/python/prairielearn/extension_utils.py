"""Utilities for element extensions in PrairieLearn.

```python
from prairielearn import ...
```
"""

import collections
import importlib.util
import os
import re
from collections import namedtuple
from collections.abc import Callable
from types import ModuleType
from typing import Any, TypeVar

from prairielearn.question_utils import QuestionData


def clean_identifier_name(name: str) -> str:
    """Escapes a string so that it becomes a valid Python identifier.


    Returns:
        The input as a valid Python identifier
    """
    # Strip invalid characters and weird leading characters so we have
    # a decent python identifier
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    name = re.sub(r"^[^a-zA-Z]+", "", name)
    return name


def load_extension(data: QuestionData, extension_name: str) -> Any:
    """
    Load a single specific extension by name for an element.

    Returns:
        A dictionary of defined variables and functions.

    Raises:
        ValueError: If the extension isn't defined in the provided `data`
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
    module_tuple = namedtuple(clean_identifier_name(extension_name), loaded.keys())  # noqa: PYI024
    return module_tuple(**loaded)


def load_all_extensions(data: QuestionData) -> dict[str, Any]:
    """
    Load all available extensions for a given element.

    Returns:
        An ordered dictionary mapping the extension name to its defined variables and functions

    Raises:
        ValueError: If the element does not have any extensions defined.
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
    """Small convenience function to load a host element script from an extension.

    Returns:
        The imported module
    """
    # Chop off the file extension because it's unnecessary here
    script_name = script_name.removesuffix(".py")
    return __import__(script_name)

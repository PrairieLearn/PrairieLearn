"""Test-only element that imports non-preloaded stdlib modules after privilege drop.

This element exists solely to catch regressions like
https://github.com/PrairieLearn/PrairieLearn/issues/14197 where the Python
stdlib becomes inaccessible after dropping privileges. The zygote preloads
many stdlib modules, so most element code works fine even when the stdlib
path is inaccessible. This element deliberately imports modules that are NOT
in the zygote preload list.
"""

# These stdlib modules are NOT imported by the zygote or its transitive
# dependencies, so they must be loaded from disk after privilege drop.
import plistlib  # noqa: F401
import tomllib  # noqa: F401


def prepare(element_html, data):
    data["params"]["stdlib_accessible"] = True

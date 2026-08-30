# These stdlib modules are NOT imported by the zygote or its transitive
# dependencies, so they must be loaded from disk after privilege drop.
# See README.md for why this question exists.
import plistlib  # ruff:ignore[unused-import]
import tomllib  # ruff:ignore[unused-import]


def generate(data):
    data["params"]["stdlib_accessible"] = True

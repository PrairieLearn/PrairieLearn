"""Entry point for PrairieLearn's custom sqlfluff plugin.

This module is loaded during sqlfluff's plugin discovery. Per sqlfluff's plugin
guidance, rule classes are imported lazily inside ``get_rules`` rather than at module
load time, so the rule metaclass runs only after all plugins are registered. Importing
them at module top level triggers a "rule imported before all plugins loaded" warning.

Add new rules by creating a ``*_rule.py`` module and listing its rule class here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlfluff.core.plugin import hookimpl

if TYPE_CHECKING:
    from sqlfluff.core.rules import BaseRule


@hookimpl
def get_rules() -> list[type[BaseRule]]:
    """Register this plugin's rules with sqlfluff."""
    from deleted_at_rule import Rule_PL_DLET
    from enrollment_status_rule import Rule_PL_STAT

    return [Rule_PL_DLET, Rule_PL_STAT]

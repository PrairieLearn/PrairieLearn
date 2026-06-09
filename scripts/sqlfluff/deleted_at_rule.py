"""Custom sqlfluff rule: references to soft-deletable tables must address ``deleted_at``.

Many PrairieLearn tables use a ``deleted_at`` timestamp for soft deletion. A query
that selects from or joins such a table without constraining ``deleted_at`` silently
includes soft-deleted rows, which is almost always a bug. See ``soft_filter`` for the
shared detection logic.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import TYPE_CHECKING

from soft_filter import path_excluded, unaddressed_targets
from sqlfluff.core.rules import BaseRule, LintResult
from sqlfluff.core.rules.crawlers import SegmentSeekerCrawler

if TYPE_CHECKING:
    from sqlfluff.core.rules import EvalResultType, RuleContext

# Tables that declare a ``deleted_at`` column but are not soft-delete-filtered in
# practice: e.g. across the codebase ``users.deleted_at`` is filtered once while
# ``users`` is joined ~130 times. Enforcing on them is almost entirely false
# positives, so they are excluded from this rule.
_EXCLUDED_TABLES = frozenset({
    "users",
    "grading_jobs",
    "lti_credentials",
    "lti_links",
    "lti13_instances",
})

# Reporting and test queries intentionally include soft-deleted rows (usage rollups
# count all historical activity; fixtures don't care), so skip those paths.
_EXCLUDED_PATHS = ("/tests/", "/admin_queries/")


@lru_cache(maxsize=1)
def _deleted_at_tables() -> frozenset[str]:
    """Soft-deletable tables this rule enforces on.

    Reads ``database/tables/*.pg`` (the schema source of truth) so the set stays in
    sync as columns are added or removed, minus ``_EXCLUDED_TABLES``. Searches upward
    from the current working directory, which is the repo root when ``sqlfluff`` is
    invoked.
    """
    directory = os.getcwd()
    while True:
        tables_dir = os.path.join(directory, "database", "tables")
        if os.path.isdir(tables_dir):
            break
        parent = os.path.dirname(directory)
        if parent == directory:
            return frozenset()
        directory = parent

    tables: set[str] = set()
    for entry in os.scandir(tables_dir):
        if not entry.name.endswith(".pg"):
            continue
        with open(entry.path) as f:
            for line in f:
                if line.strip().startswith("deleted_at:"):
                    tables.add(entry.name[: -len(".pg")])
                    break
    return frozenset(tables - _EXCLUDED_TABLES)


class Rule_PL_DLET(BaseRule):  # noqa: N801
    """References to soft-deletable tables must address ``deleted_at``.

    A table with a ``deleted_at`` column holds soft-deleted rows. Selecting from or
    joining such a table without constraining ``deleted_at`` silently includes those
    rows.

    **Anti-pattern**

    .. code-block:: sql

        SELECT a.id
        FROM assessments AS a
        JOIN course_instances AS ci ON ci.id = a.course_instance_id

    **Best practice**

    Constrain ``deleted_at`` for every soft-deletable table in the query. If including
    deleted rows is intentional, suppress the line with ``-- noqa: PL_DLET``.

    .. code-block:: sql

        SELECT a.id
        FROM assessments AS a
        JOIN course_instances AS ci ON ci.id = a.course_instance_id
        WHERE a.deleted_at IS NULL AND ci.deleted_at IS NULL
    """

    name = "references.deleted_at"
    groups = ("all",)
    crawl_behaviour = SegmentSeekerCrawler({"select_statement"})
    is_fix_compatible = False

    def _eval(self, context: RuleContext) -> EvalResultType:
        if path_excluded(context.path, _EXCLUDED_PATHS):
            return None

        deleted_at_tables = _deleted_at_tables()
        if not deleted_at_tables:
            return None

        results = [
            LintResult(
                anchor=alias.object_reference,
                description=(
                    f"Table {name!r} has a 'deleted_at' column but the query does not "
                    f"reference '{alias.ref_str}.deleted_at'. Add a deleted_at filter, "
                    "or suppress with `-- noqa: PL_DLET` if including deleted rows is "
                    "intentional."
                ),
            )
            for alias, name in unaddressed_targets(
                context.segment,
                context.dialect,
                column="deleted_at",
                tables=deleted_at_tables,
            )
        ]
        return results or None

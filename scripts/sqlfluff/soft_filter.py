"""Shared logic for rules that require a "soft-filter" column to be constrained.

Several PrairieLearn tables carry a column that quietly excludes rows unless a query
constrains it -- e.g. ``deleted_at`` (soft deletion) or ``enrollments.status``. A query
that selects from or joins such a table without referencing the column silently
includes rows it almost certainly meant to exclude.

The helpers here detect, for a given column, which soft-filterable tables in a
``SELECT`` fail to reference that column in their ``WHERE`` clause or a ``JOIN ... ON``
condition. Referencing the column at all counts as "addressing" it (including
intentionally selecting excluded rows), so callers enforce awareness, not a specific
predicate.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlfluff.utils.analysis.select import get_aliases_from_select

if TYPE_CHECKING:
    from collections.abc import Collection
    from pathlib import Path

    from sqlfluff.core.dialects.base import Dialect
    from sqlfluff.core.dialects.common import AliasInfo
    from sqlfluff.core.parser import BaseSegment


def normalize(raw: str) -> str:
    """Lower-case an identifier and strip quoting characters."""
    return raw.strip("\"'`[]").lower()


def path_excluded(path: Path | None, parts: Collection[str]) -> bool:
    """Whether ``path`` lies under any of the excluded directory ``parts``."""
    if path is None:
        return False
    posix = path.as_posix()
    return any(part in posix for part in parts)


def table_name(alias: AliasInfo) -> str | None:
    """The bare table name an alias points at, or ``None`` for derived tables."""
    obj_ref = alias.object_reference
    if not obj_ref:
        return None
    identifiers = list(obj_ref.recursive_crawl("naked_identifier", "quoted_identifier"))
    if not identifiers:
        return None
    return normalize(identifiers[-1].raw)


def _addressed_qualifiers(
    select_stmt: BaseSegment, column: str, *, single_table: bool
) -> set[str | None]:
    """Qualifiers whose ``column`` is referenced in a WHERE or JOIN ON.

    Returns the set of normalized qualifiers (e.g. ``{"e"}``) seen in front of the
    column. Includes ``None`` when an unqualified reference appears in a single-table
    select (where the qualifier is unambiguous).
    """
    clauses: list[BaseSegment] = []
    where_clause = select_stmt.get_child("where_clause")
    if where_clause:
        clauses.append(where_clause)
    from_clause = select_stmt.get_child("from_clause")
    if from_clause:
        clauses.extend(
            from_clause.recursive_crawl(
                "join_on_condition", no_recursive_seg_type="select_statement"
            )
        )

    qualifiers: set[str | None] = set()
    for clause in clauses:
        for col_ref in clause.recursive_crawl(
            "column_reference", no_recursive_seg_type="select_statement"
        ):
            parts = [
                normalize(seg.raw)
                for seg in col_ref.recursive_crawl(
                    "naked_identifier", "quoted_identifier"
                )
            ]
            if not parts or parts[-1] != column:
                continue
            if len(parts) >= 2:
                qualifiers.add(parts[-2])
            elif single_table:
                qualifiers.add(None)
    return qualifiers


def unaddressed_targets(
    select_stmt: BaseSegment,
    dialect: Dialect,
    *,
    column: str,
    tables: Collection[str],
) -> list[tuple[AliasInfo, str]]:
    """Soft-filterable ``tables`` in this select that don't constrain ``column``.

    Returns ``(alias, table_name)`` pairs for each ``FROM``/``JOIN`` of a target table
    whose ``column`` is not referenced in a ``WHERE`` clause or ``JOIN ... ON``.
    """
    from_clause = select_stmt.get_child("from_clause")
    if from_clause is None:
        return []

    # Cheap gate: a real reference to a target table always contains its name verbatim
    # in the FROM text, so skip the (relatively) expensive alias analysis when none of
    # the target names appear. Never skips a genuine match.
    haystack = from_clause.raw.lower()
    if not any(name in haystack for name in tables):
        return []

    table_aliases, _ = get_aliases_from_select(select_stmt, dialect)
    if not table_aliases:
        return []

    targets = [
        (alias, name)
        for alias in table_aliases
        if (name := table_name(alias)) is not None and name in tables
    ]
    if not targets:
        return []

    single_table = len(table_aliases) == 1
    addressed = _addressed_qualifiers(select_stmt, column, single_table=single_table)
    if single_table and None in addressed:
        return []

    return [
        (alias, name)
        for alias, name in targets
        if normalize(alias.ref_str) not in addressed
    ]

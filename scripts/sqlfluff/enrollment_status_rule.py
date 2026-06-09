"""Custom sqlfluff rule: references to ``enrollments`` must address ``status``.

The ``enrollments`` table holds rows in several states (``invited``, ``joined``,
``left``, ``removed``, ``rejected``, ``blocked``, ``lti13_pending``). A query that
selects from or joins ``enrollments`` without constraining ``status`` silently counts
non-joined enrollments -- e.g. blocked or removed students -- which is almost always a
bug. See https://github.com/PrairieLearn/PrairieLearn/pull/14611. The shared detection
logic lives in ``soft_filter``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from soft_filter import unaddressed_targets
from sqlfluff.core.rules import BaseRule, LintResult
from sqlfluff.core.rules.crawlers import SegmentSeekerCrawler

if TYPE_CHECKING:
    from sqlfluff.core.rules import EvalResultType, RuleContext

_ENROLLMENT_TABLES = frozenset({"enrollments"})


class Rule_PL_STAT(BaseRule):  # noqa: N801
    """References to ``enrollments`` must address the ``status`` column.

    The ``enrollments`` table holds rows in several states. Selecting from or joining
    it without constraining ``status`` silently includes non-joined enrollments
    (blocked, removed, invited, etc.).

    **Anti-pattern**

    .. code-block:: sql

        SELECT u.uid
        FROM users AS u
        JOIN enrollments AS e ON e.user_id = u.id
        WHERE e.course_instance_id = $course_instance_id

    **Best practice**

    Constrain ``status`` (usually ``status = 'joined'``). If including non-joined
    enrollments is intentional, suppress the line with ``-- noqa: PL_STAT``.

    .. code-block:: sql

        SELECT u.uid
        FROM users AS u
        JOIN enrollments AS e ON e.user_id = u.id AND e.status = 'joined'
        WHERE e.course_instance_id = $course_instance_id
    """

    name = "references.enrollment_status"
    groups = ("all",)
    crawl_behaviour = SegmentSeekerCrawler({"select_statement"})
    is_fix_compatible = False

    def _eval(self, context: RuleContext) -> EvalResultType:
        results = [
            LintResult(
                anchor=alias.object_reference,
                description=(
                    f"Table 'enrollments' is referenced as {alias.ref_str!r} but the "
                    f"query does not constrain '{alias.ref_str}.status'. Add a status "
                    "filter (usually `status = 'joined'`), or suppress with "
                    "`-- noqa: PL_STAT` if including non-joined enrollments is "
                    "intentional."
                ),
            )
            for alias, _name in unaddressed_targets(
                context.segment,
                context.dialect,
                column="status",
                tables=_ENROLLMENT_TABLES,
            )
        ]
        return results or None

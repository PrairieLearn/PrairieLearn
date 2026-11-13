#!/usr/bin/env python3
"""Inventory and calendar-shift the dates in a PrairieLearn course instance.

    shift_dates.py scan  COURSE_INSTANCE_DIR [--calendar TERM.json]
    shift_dates.py plan  COURSE_INSTANCE_DIR --from FROM.json --to TO.json [--csv PLAN.csv]
    shift_dates.py apply COURSE_INSTANCE_DIR --plan PLAN.csv
    shift_dates.py strip COURSE_INSTANCE_DIR
    shift_dates.py report COURSE_INSTANCE_DIR --plan PLAN.csv --from FROM.json --to TO.json [--md OUT.md]

`scan` lists every date and everything else that belongs to one term: UID
rules, per-student overrides, PrairieTest exams, term-named questions, dates
in text, folders PrairieLearn doesn't sync.
`plan` maps each date to the target term and writes a reviewable CSV.
`apply` rewrites the JSON files from the (possibly hand-edited) `new` column.
`strip` removes legacy UID rules and per-student `accessControl` overrides.
`apply` and `strip` edit the text in place, so formatting, key order and line
endings are kept and the diff shows only what changed.

A calendar is a JSON file:

    {"term": "Fall 2026", "instructionBegins": "2026-08-24", "instructionEnds": "2026-12-09",
     "breaks": [{"name": "Fall break", "start": "2026-11-21", "end": "2026-11-29"}],
     "holidays": [{"name": "Labor Day", "date": "2026-09-07"}],
     "finals": {"start": "2026-12-11", "end": "2026-12-17"},
     "addDeadline": "2026-08-31"}

Only `instructionBegins` is required. Without `instructionEnds`, `breaks` and
`finals`, the mapping is a whole-week shift that keeps weekdays.

Mapping rule: a date is located by instructional week (weeks counted from the
week instruction begins, skipping weeks that are entirely break) and weekday,
and placed at the same instructional week and weekday in the target term. Time
of day is kept. Dates before week 1, between the end of instruction and finals,
in finals, or after finals keep their day offset from that boundary. A date in
a source break goes to a target break at the same point in the term, or else
to the next week of instruction. Anything that lands on a holiday, in a break,
outside instruction, in the past, or out of order within its rule is flagged.
"""

import argparse
import contextlib
import csv
import datetime as dt
import itertools
import json
import os
import re
import sys
from collections import defaultdict
from collections.abc import Iterator
from typing import Any

JsonObject = dict[str, Any]
# ("week" or "break", weeks of instruction before it, weekday), or (kind, days from a boundary).
Location = tuple[Any, ...]
CalendarEvent = tuple[dt.date, dt.date, str]
PlanRow = dict[str, str]

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")
QUOTED_DATE_RE = re.compile(r'"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}[^"]*)"')
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STALE_WEEKS = 10
MONTH_RE = re.compile(
    r"\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|Jul(y)?|Aug(ust)?|Sep(t|tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\.?\s+\d{1,2}\b"
)
TERM_RE = re.compile(
    r"(?i)(?<![a-z])(fa|fall|sp|spring|su|summer|wi|winter|au|autumn)[-_ ]?(20)?\d\d(?!\d)"
)
QUESTION_ID_RE = re.compile(
    r"zones\[\d+\]\.questions\[\d+\](\.alternatives\[\d+\])?\.id$"
)
RELEASE_RE = re.compile(r"(release\.date|startDate|visibleFromDate)$")
SYNCED_DIRS = {"assessments", "clientFilesCourseInstance"}


def day(s: str) -> dt.date:
    """Parse the date part of a date string."""
    return dt.date.fromisoformat(s[:10])


def stamp(s: str) -> dt.datetime:
    """Parse a date string to the second, ignoring any UTC offset."""
    return dt.datetime.fromisoformat(s[:19].replace(" ", "T"))


def monday(d: dt.date) -> dt.date:
    """Return the Monday of the week containing `d`."""
    return d - dt.timedelta(days=d.weekday())


def days(n: int) -> str:
    """Format a day count, such as "1 day" or "3 days"."""
    return f"{n} day{'s' if n != 1 else ''}"


def read_text(path: str) -> str:
    """Read a file without translating its line endings."""
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write_text(path: str, text: str) -> None:
    """Write a file without translating its line endings."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


class Calendar:
    def __init__(self, path: str) -> None:
        j = json.loads(read_text(path))
        self.term = j.get("term", os.path.basename(path))
        self.begin = day(j["instructionBegins"])
        self.end = day(j["instructionEnds"]) if j.get("instructionEnds") else None
        self.breaks = [
            (day(b["start"]), day(b["end"]), b.get("name", "break"))
            for b in j.get("breaks", [])
        ]
        self.holidays = {
            day(h["date"]): h.get("name", "holiday") for h in j.get("holidays", [])
        }
        f = j.get("finals")
        self.finals = (day(f["start"]), day(f["end"])) if f else None
        self.add_deadline = day(j["addDeadline"]) if j.get("addDeadline") else None
        self.w1 = monday(self.begin)
        last = monday(self.end) if self.end else self.w1 + dt.timedelta(weeks=60)
        n = (last - self.w1).days // 7 + 1
        self.break_weeks = {
            k
            for k in range(n)
            if all(
                self.in_break(self.w1 + dt.timedelta(days=7 * k + i)) for i in range(5)
            )
        }
        self.inst_weeks = [k for k in range(n) if k not in self.break_weeks]

    def in_break(self, d: dt.date) -> str | None:
        return next((name for s, e, name in self.breaks if s <= d <= e), None)

    def term_end(self) -> dt.date | None:
        return self.finals[1] if self.finals else self.end

    def weeks_before(self, k: int) -> int:
        return sum(1 for w in self.inst_weeks if w < k)

    def locate(self, d: dt.date) -> Location:
        if d < self.w1:
            return ("pre", (d - self.w1).days)
        if self.end and d > self.end:
            if self.finals and d > self.finals[1]:
                return ("post", (d - self.finals[1]).days)
            if self.finals and d >= self.finals[0]:
                return ("finals", (d - self.finals[0]).days)
            return ("gap", (d - self.end).days)
        k = (d - self.w1).days // 7
        if k in self.break_weeks:
            return ("break", self.weeks_before(k), d.weekday())
        return ("week", self.inst_weeks.index(k), d.weekday())

    def describe(self, loc: Location) -> str:
        kind = loc[0]
        if kind == "week":
            return f"week {loc[1] + 1} {WEEKDAYS[loc[2]]}"
        if kind == "break":
            return f"break after week {loc[1]}, {WEEKDAYS[loc[2]]}"
        if kind == "pre":
            return f"{days(-loc[1])} before week 1"
        if kind == "gap":
            return f"{days(loc[1])} after instruction ends"
        if kind == "finals":
            return f"finals day {loc[1] + 1}"
        return (
            f"{days(loc[1])} after finals"
            if self.finals
            else f"{days(loc[1])} after the term"
        )

    def place(self, loc: Location) -> tuple[dt.date | None, list[str]]:
        """Return (date, flags) for a location from another calendar."""
        flags = []
        kind = loc[0]
        if kind == "pre":
            return self.w1 + dt.timedelta(days=loc[1]), flags
        if kind in ("gap", "finals", "post") and not self.end:
            return None, ["target calendar has no end of instruction"]
        if kind == "gap":
            return self.end + dt.timedelta(days=loc[1]), flags
        if kind == "finals":
            if not self.finals:
                flags.append("target calendar has no finals period")
                return self.end + dt.timedelta(days=loc[1] + 2), flags
            d = self.finals[0] + dt.timedelta(days=loc[1])
            if d > self.finals[1]:
                flags.append(
                    "target finals are shorter; moved to the last day of finals"
                )
                d = self.finals[1]
            return d, flags
        if kind == "post":
            return self.term_end() + dt.timedelta(days=loc[1]), flags
        if kind == "break":
            same_point = [
                k for k in sorted(self.break_weeks) if self.weeks_before(k) == loc[1]
            ]
            if same_point:
                return self.w1 + dt.timedelta(days=7 * same_point[0] + loc[2]), [
                    "source date was in a break"
                ]
            flags.append(
                "source date was in a break the target term doesn't have at that point; moved to the next week"
            )
            loc = ("week", loc[1], loc[2])
        i, wd = loc[1], loc[2]
        if i < len(self.inst_weeks):
            k = self.inst_weeks[i]
        else:
            k = self.inst_weeks[-1] + (i - len(self.inst_weeks) + 1)
            flags.append("beyond the target term's weeks of instruction")
        return self.w1 + dt.timedelta(days=7 * k + wd), flags

    def check(self, d: dt.date) -> list[str]:
        flags = []
        if d in self.holidays:
            flags.append(f"lands on {self.holidays[d]}")
        b = self.in_break(d)
        if b:
            flags.append(f"lands in {b}")
        if self.end and self.end < d and (not self.finals or d < self.finals[0]):
            flags.append("lands between end of instruction and finals")
        return flags

    def stale(self, d: dt.date) -> bool:
        lo = self.w1 - dt.timedelta(weeks=STALE_WEEKS)
        hi = (self.term_end() or self.w1 + dt.timedelta(weeks=20)) + dt.timedelta(
            weeks=STALE_WEEKS
        )
        return not (lo <= d <= hi)


def walk(o: Any, path: str = "") -> Iterator[tuple[str, Any]]:
    """Yield (path, value) for every leaf of a parsed JSON value."""
    if isinstance(o, dict):
        for k, v in o.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from walk(v, f"{path}[{i}]")
    else:
        yield path, o


def json_files(ci: str) -> Iterator[tuple[str, str]]:
    """Yield (relative path, path) for the course instance's JSON files."""
    yield "infoCourseInstance.json", os.path.join(ci, "infoCourseInstance.json")
    root = os.path.join(ci, "assessments")
    for dirpath, dirnames, files in os.walk(root):
        dirnames.sort()
        if "infoAssessment.json" in files:
            p = os.path.join(dirpath, "infoAssessment.json")
            yield os.path.relpath(p, ci), p


def load(path: str) -> tuple[list[tuple[str, str]], JsonObject]:
    """Return a file's dates as (path, value) pairs, and its parsed JSON."""
    data = json.loads(read_text(path))
    return [
        (p, v) for p, v in walk(data) if isinstance(v, str) and DATE_RE.match(v)
    ], data


def student_rules(data: JsonObject) -> tuple[list[int], list[int]]:
    """Indices of rules that target specific students: legacy UID rules and label-less overrides."""
    legacy = [i for i, r in enumerate(data.get("allowAccess") or []) if r.get("uids")]
    modern = [
        i
        for i, r in enumerate(data.get("accessControl") or [])
        if i > 0 and "labels" not in r
    ]
    return legacy, modern


def in_student_rule(path: str, data: JsonObject) -> bool:
    """Return whether a date path is inside a rule that targets specific students."""
    legacy, modern = student_rules(data)
    prefixes = [f"allowAccess[{i}]." for i in legacy] + [
        f"accessControl[{i}]." for i in modern
    ]
    return any(path.startswith(p) for p in prefixes)


def short(rel: str) -> str:
    """Shorten an assessment file's path to its assessment ID."""
    if rel.startswith("assessments/"):
        return os.path.dirname(rel)[len("assessments/") :] or rel
    return rel


def term_items(rel: str, data: JsonObject) -> list[tuple[str, str]]:
    """Things other than dates that belong to one term."""
    items = []
    for rule in data.get("allowAccess") or []:
        if rule.get("examUuid"):
            items.append((rel, "PrairieTest exam UUID"))
        if rule.get("password"):
            items.append((rel, "assessment password"))
        if rule.get("institution") == "LTI":
            items.append((rel, "LTI 1.1 access rule"))
        elif rule.get("institution"):
            items.append((
                rel,
                f"access limited to institution {rule['institution']!r} (publishing uses selfEnrollment.restrictToInstitution instead)",
            ))
        if rule.get("mode") == "Exam" and not rule.get("examUuid"):
            items.append((
                rel,
                "Exam-mode rule without a PrairieTest exam (proctored room or testing center)",
            ))
    for i, rule in enumerate(data.get("accessControl") or []):
        exams = ((rule.get("integrations") or {}).get("prairieTest") or {}).get(
            "exams"
        ) or []
        items += [(rel, "PrairieTest exam UUID")] * len(exams)
        if (rule.get("dateControl") or {}).get("password"):
            items.append((rel, "assessment password"))
        if i > 0 and "labels" not in rule:
            items.append((
                rel,
                "per-student override (removed by strip; the students are stored in PrairieLearn)",
            ))
        elif i > 0:
            items.append((
                rel,
                f"override for student labels {', '.join(rule['labels'])} (keep; re-add label members)",
            ))
    for p, v in walk(data):
        if QUESTION_ID_RE.search(p) and isinstance(v, str) and TERM_RE.search(v):
            items.append((rel, f"question named for a term: {v}"))
    text = data.get("text") or ""
    if MONTH_RE.search(text) or re.search(r"\b20\d\d\b", text):
        items.append((rel, "assessment text mentions a date or year"))
    return items


def uid_groups(ci: str) -> list[tuple[frozenset[str], list[str]]]:
    """Legacy UID rules grouped by their exact set of UIDs, without revealing the UIDs."""
    groups = defaultdict(list)
    for rel, path in json_files(ci):
        _, data = load(path)
        for rule in data.get("allowAccess") or []:
            if rule.get("uids"):
                groups[frozenset(rule["uids"])].append(short(rel))
    return sorted(groups.items(), key=lambda kv: -len(kv[1]))


def client_mentions(ci: str, years: set[str]) -> list[tuple[str, str]]:
    """Find client files that are named for, or mention, a date or term."""
    hits = []
    pat = re.compile(r"\b(" + "|".join(sorted(years)) + r")\b") if years else None
    for dirpath, _, files in os.walk(ci):
        if "clientFiles" not in dirpath:
            continue
        for f in files:
            p = os.path.join(dirpath, f)
            rel = os.path.relpath(p, ci)
            if (pat and pat.search(f)) or TERM_RE.search(f):
                hits.append((rel, "client file named for a year or term"))
            elif f.lower().endswith((".html", ".md", ".txt", ".json")):
                with open(p, encoding="utf-8", errors="ignore") as file:
                    s = file.read()
                if (pat and pat.search(s)) or MONTH_RE.search(s):
                    hits.append((rel, "client file mentions a date or the term's year"))
            elif f.lower().endswith((".pdf", ".docx", ".pptx")):
                hits.append((rel, "client document (check by hand for dates)"))
    return hits


def other_uuids(ci: str) -> dict[str | None, str]:
    """Map the UUIDs of the course's other course instances to their folders."""
    parent = os.path.dirname(os.path.abspath(ci))
    out = {}
    for d in os.listdir(parent):
        p = os.path.join(parent, d, "infoCourseInstance.json")
        if os.path.abspath(os.path.join(parent, d)) != os.path.abspath(
            ci
        ) and os.path.exists(p):
            with contextlib.suppress(ValueError):
                out[json.loads(read_text(p)).get("uuid")] = d
    return out


def is_release(path: str) -> bool:
    """Return whether a date path opens access rather than ending it."""
    return bool(RELEASE_RE.search(path))


def cmd_scan(args: argparse.Namespace) -> None:
    """List every date and everything else that belongs to one term."""
    cal = Calendar(args.calendar) if args.calendar else None
    n_dates, years, items, stale, conflicts = 0, set(), [], [], []
    for rel, path in json_files(args.ci):
        dates, data = load(path)
        n_dates += len(dates)
        for p, v in dates:
            years.add(v[:4])
            if cal and cal.stale(day(v)):
                stale.append((rel, v[:10]))
            elif cal:
                conflicts.extend((rel, p, v, flag) for flag in cal.check(day(v)))
        items += term_items(rel, data)
        if rel == "infoCourseInstance.json":
            dup = other_uuids(args.ci).get(data.get("uuid"))
            if dup:
                items.append((
                    rel,
                    f"UUID is the same as courseInstances/{dup}; a copy in the same course needs a new one",
                ))
            items.append((rel, f"longName {data.get('longName')!r}"))
            if data.get("allowAccess"):
                items.append((
                    rel,
                    "legacy course instance allowAccess (replace with publishing unless the course uses LTI 1.1)",
                ))
    items += client_mentions(args.ci, years)
    for d in sorted(os.listdir(args.ci)):
        if os.path.isdir(os.path.join(args.ci, d)) and d not in SYNCED_DIRS:
            items.append((d, "folder PrairieLearn doesn't sync"))

    print(f"{n_dates} dates in {args.ci} (years: {', '.join(sorted(years))})")
    if cal:
        by = defaultdict(set)
        for rel, d in stale:
            by[short(rel)].add(d)
        print(
            f"\n{len(stale)} dates outside {cal.term} (more than {STALE_WEEKS} weeks before or after it):"
        )
        for rel, ds in by.items():
            print(f"  {rel}: {', '.join(sorted(ds))}")
        deadlines = [c for c in conflicts if not is_release(c[1])]
        print(
            f"\n{len(conflicts)} dates on a holiday, in a break, or between instruction and finals "
            f"({len(deadlines)} deadlines, {len(conflicts) - len(deadlines)} releases):"
        )
        for rel, p, v, flag in conflicts:
            print(
                f"  {'release ' if is_release(p) else 'DEADLINE'} {short(rel)} {p} {v} ({flag})"
            )
    groups = uid_groups(args.ci)
    if groups:
        print(
            f"\n{sum(len(a) for _, a in groups)} legacy UID rules, by set of UIDs (UIDs not shown):"
        )
        for uids, where in groups:
            kind = (
                "repeats across many assessments: often course staff or CAs"
                if len(where) >= 5
                else "few assessments: likely extensions or accommodations"
            )
            shown = ", ".join(sorted(set(where))[:6]) + (
                " ..." if len(set(where)) > 6 else ""
            )
            print(
                f"  {len(uids)} UIDs on {len(where)} assessment{'s' if len(where) != 1 else ''} ({kind}): {shown}"
            )
    grouped = defaultdict(list)
    for rel, what in items:
        grouped[what].append(short(rel))
    print(f"\n{len(items)} other term-specific items:")
    for what, where in grouped.items():
        names = sorted(set(where))
        shown = ", ".join(names[:12]) + (
            f", ... ({len(names) - 12} more)" if len(names) > 12 else ""
        )
        print(f"  {what} ({len(where)}): {shown}")


def rule_dates(paths: dict[str, str]) -> dict[str, dict[str, dt.datetime]]:
    """Group a file's dates by access rule."""
    rules = defaultdict(dict)
    for p, v in paths.items():
        m = re.match(r"((allowAccess|accessControl)\[\d+\])\.(.*)$", p)
        if m:
            rules[m.group(1)][m.group(3)] = stamp(v)
    return rules


def window(f: dict[str, dt.datetime]) -> dt.timedelta | None:
    """Return how long a rule is open, if it has both a start and an end."""
    start = f.get("startDate") or f.get("dateControl.release.date")
    end = f.get("endDate") or f.get("dateControl.due.date")
    return (end - start) if start and end else None


def order_flags(
    old_by_file: dict[str, dict[str, str]], new_by_file: dict[str, dict[str, str]]
) -> dict[tuple[str, str], list[str]]:
    """Flag rules whose dates are out of order, or whose open window shrinks by more than half."""
    out = defaultdict(list)
    for rel, data_paths in new_by_file.items():
        old_rules = rule_dates(old_by_file[rel])
        for rule, f in rule_dates(data_paths).items():
            before, after = window(old_rules.get(rule, {})), window(f)
            if (
                before
                and after is not None
                and before > dt.timedelta(days=1)
                and after < before / 2
            ):
                key = "endDate" if "endDate" in f else "dateControl.due.date"
                out[rel, f"{rule}.{key}"].append(
                    f"open window shrinks from {before.days} days to {after.total_seconds() / 86400:.1f}"
                )
            seq = [
                (key, f[key])
                for key in ("startDate", "dateControl.release.date")
                if key in f
            ]
            early = sorted(
                (k, v)
                for k, v in f.items()
                if k.startswith("dateControl.earlyDeadlines")
            )
            seq += early
            seq += [
                (key, f[key]) for key in ("dateControl.due.date", "endDate") if key in f
            ]
            seq += sorted(
                (k, v)
                for k, v in f.items()
                if k.startswith("dateControl.lateDeadlines")
            )
            for (ka, a), (kb, b) in itertools.pairwise(seq):
                if b < a:
                    out[rel, f"{rule}.{kb}"].append(
                        f"out of order: before {rule}.{ka} ({a:%Y-%m-%d %H:%M})"
                    )
    return out


def rule_of(path: str) -> str | None:
    """Return the access rule a date path belongs to."""
    m = re.match(r"((allowAccess|accessControl)\[\d+\])\.", path)
    return m.group(1) if m else None


def cmd_plan(args: argparse.Namespace) -> None:
    """Map each date to the target term and write a reviewable CSV."""
    src, dst = Calendar(args.from_), Calendar(args.to)
    today = dt.datetime.now(dt.UTC).date()
    rows, mapped, originals = [], defaultdict(dict), defaultdict(dict)
    for rel, path in json_files(args.ci):
        dates, data = load(path)
        stale_rules = {rule_of(p) for p, v in dates if src.stale(day(v)) and rule_of(p)}
        for p, v in dates:
            d = day(v)
            if in_student_rule(p, data):
                rows.append([rel, p, v, v, "per-student rule (removed by strip)", ""])
                continue
            if rule_of(p) in stale_rules and not src.stale(d):
                rows.append([
                    rel,
                    p,
                    v,
                    v,
                    "rule has a date outside the source term; left unchanged",
                    "rule outside source term",
                ])
                continue
            if src.stale(d):
                rows.append([
                    rel,
                    p,
                    v,
                    v,
                    "outside the source term; left unchanged",
                    "outside source term",
                ])
                continue
            loc = src.locate(d)
            nd, flags = dst.place(loc)
            if nd is None:
                rows.append([rel, p, v, v, src.describe(loc), "; ".join(flags)])
                continue
            if p.endswith("selfEnrollment.beforeDate") and dst.add_deadline:
                nd, flags = dst.add_deadline, ["set to the add deadline"]
            flags += dst.check(nd)
            if loc[0] in ("gap", "finals") and nd.weekday() != d.weekday():
                flags.append(
                    f"weekday changes {WEEKDAYS[d.weekday()]}->{WEEKDAYS[nd.weekday()]}"
                )
            if nd < today:
                flags.append("already in the past")
            new = nd.isoformat() + v[10:]
            mapped[rel][p] = new
            originals[rel][p] = v
            rows.append([rel, p, v, new, src.describe(loc), "; ".join(flags)])
    for (rel, p), msgs in order_flags(originals, mapped).items():
        for r in rows:
            if r[0] == rel and r[1] == p:
                r[5] = "; ".join(x for x in [r[5], *msgs] if x)
    with (
        open(args.csv, "w", newline="")
        if args.csv
        else contextlib.nullcontext(sys.stdout) as out
    ):
        w = csv.writer(out)
        w.writerow([
            "file",
            "path",
            "old",
            "new",
            "position in source term",
            "flags",
            "reason",
        ])
        w.writerows([*r, ""] for r in rows)
    if args.csv:
        flagged = [r for r in rows if r[5]]
        print(
            f"{len(rows)} dates mapped {src.term} -> {dst.term}; {len(flagged)} flagged. Plan: {args.csv}"
        )
        past = [r for r in rows if "already in the past" in r[5]]
        for r in flagged:
            rest = "; ".join(f for f in r[5].split("; ") if f != "already in the past")
            if rest:
                kind = "release " if is_release(r[1]) else "deadline"
                print(f"  {kind} {short(r[0])} {r[1]} {r[2]} -> {r[3]} | {rest}")
        if past:
            print(
                f"  {len(past)} new dates are already in the past (through {max(r[3] for r in past)[:10]}); "
                "has the target term already started?"
            )


def read_plan(path: str) -> list[PlanRow]:
    """Read the rows of a plan CSV."""
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def cmd_apply(args: argparse.Namespace) -> None:
    """Rewrite the JSON files from the plan's `new` column."""
    plan = defaultdict(dict)
    for r in read_plan(args.plan):
        plan[r["file"]][r["path"]] = (r["old"], r["new"])
    changed = 0
    for rel, edits in plan.items():
        path = os.path.join(args.ci, rel)
        text = read_text(path)
        dates, _ = load(path)
        if {p for p, _ in dates} != set(edits):
            sys.exit(
                f"{rel}: its dates don't match the plan (file edited since planning?); re-run plan"
            )
        occurrences = list(QUOTED_DATE_RE.finditer(text))
        if [m.group(1) for m in occurrences] != [v for _, v in dates]:
            sys.exit(
                f"{rel}: date strings in the file don't line up with the parsed JSON; edit it by hand"
            )
        out, last = [], 0
        for (p, v), m in zip(dates, occurrences, strict=True):
            old, new = edits[p]
            if old != v:
                sys.exit(
                    f"{rel} {p}: plan says {old} but the file has {v}; re-run plan"
                )
            if not DATE_RE.match(new):
                sys.exit(f"{rel} {p}: {new!r} isn't a date")
            out += [text[last : m.start(1)], new]
            last = m.end(1)
            changed += new != v
        out.append(text[last:])
        write_text(path, "".join(out))
    print(f"Rewrote {changed} dates in {len(plan)} files")


def array_elements(
    text: str, key: str
) -> tuple[int, int, list[tuple[int, int]]] | None:
    """Spans (start, end) of each element of the top-level array `key`."""
    m = re.search(r'"' + key + r'"\s*:\s*\[', text)
    if not m:
        return None
    dec, pos, spans = json.JSONDecoder(), m.end(), []
    while True:
        while text[pos] in " \t\r\n,":
            pos += 1
        if text[pos] == "]":
            return m.end(), pos, spans
        _, end = dec.raw_decode(text, pos)
        spans.append((pos, end))
        pos = end


def remove_elements(text: str, key: str, drop: list[int]) -> str:
    """Remove elements of the top-level array `key` by index, keeping the rest of the text."""
    found = array_elements(text, key)
    if not found or not drop:
        return text
    open_end, close, spans = found
    if len(set(drop)) == len(spans):
        return text[:open_end] + text[close:]
    keep = [i for i in range(len(spans)) if i not in drop]
    cuts = []
    for i in sorted(drop):
        later = [k for k in keep if k > i]
        if later:
            # Cut from this element up to the next kept one, taking the comma with it.
            cuts.append((spans[i][0], spans[later[0]][0]))
        else:
            # Trailing elements: cut from the end of the last kept one.
            earlier = max(k for k in keep if k < i)
            cuts.append((spans[earlier][1], spans[i][1]))
    merged = []
    for s, e in sorted(cuts):
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(e, merged[-1][1]))
        else:
            merged.append((s, e))
    for s, e in reversed(merged):
        text = text[:s] + text[e:]
    return text


def cmd_strip(args: argparse.Namespace) -> None:
    """Remove legacy UID rules and per-student overrides."""
    total, notes = 0, []
    for rel, path in json_files(args.ci):
        text = read_text(path)
        data = json.loads(text)
        legacy, modern = student_rules(data)
        if not legacy and not modern:
            continue
        for key, drop in (("allowAccess", legacy), ("accessControl", modern)):
            text = remove_elements(text, key, drop)
        expected = json.loads(read_text(path))
        if legacy:
            expected["allowAccess"] = [
                r for i, r in enumerate(expected["allowAccess"]) if i not in legacy
            ]
        if modern:
            expected["accessControl"] = [
                r for i, r in enumerate(expected["accessControl"]) if i not in modern
            ]
        if json.loads(text) != expected:
            sys.exit(f"{rel}: couldn't remove the rules cleanly; edit it by hand")
        write_text(path, text)
        total += len(legacy) + len(modern)
        if "allowAccess" in expected and not expected["allowAccess"]:
            notes.append(
                f"{short(rel)}: no allowAccess rules left, so only staff can open it"
            )
    print(f"Removed {total} per-student rules")
    for n in notes:
        print("  " + n)


def date_roles(data: JsonObject) -> dict[str, tuple[str, Any]]:
    """Map date paths to what they mean for students: release, due, late, closes."""
    roles = {}
    ac = data.get("accessControl") or []
    if ac:
        dc = ac[0].get("dateControl") or {}
        if (dc.get("release") or {}).get("date"):
            roles["accessControl[0].dateControl.release.date"] = ("release", None)
        if (dc.get("due") or {}).get("date"):
            roles["accessControl[0].dateControl.due.date"] = ("due", None)
        for kind in ("earlyDeadlines", "lateDeadlines"):
            for i, x in enumerate(dc.get(kind) or []):
                roles[f"accessControl[0].dateControl.{kind}[{i}].date"] = (
                    "late" if kind == "lateDeadlines" else "early",
                    x.get("credit"),
                )
        return roles
    rules = [
        (i, r) for i, r in enumerate(data.get("allowAccess") or []) if not r.get("uids")
    ]
    starts = [
        (r["startDate"], f"allowAccess[{i}].startDate")
        for i, r in rules
        if r.get("startDate")
    ]
    if starts:
        roles[min(starts)[1]] = ("release", None)
    full = [
        (r["endDate"], f"allowAccess[{i}].endDate")
        for i, r in rules
        if r.get("endDate") and r.get("credit", 0) >= 100
    ]
    if full:
        roles[min(full)[1]] = ("due", None)
    for i, r in rules:
        if r.get("endDate") and 0 < r.get("credit", 0) < 100:
            roles[f"allowAccess[{i}].endDate"] = ("late", r["credit"])
    zero = [
        (r["endDate"], f"allowAccess[{i}].endDate")
        for i, r in rules
        if r.get("endDate") and not r.get("credit")
    ]
    if zero:
        roles[max(zero)[1]] = ("closes", None)
    return roles


def fmt(s: str, *, with_time: bool = True) -> str:
    """Format a date string for the report, such as "Mon, Sep 7, 23:59"."""
    t = stamp(s)
    out = f"{WEEKDAYS[t.weekday()]}, {t:%b} {t.day}"
    return out + (f", {t:%H:%M}" if with_time else "")


DAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
KIND_WORDS = {
    "release": "Release",
    "due": "Due date",
    "closes": "Closing date",
    "late": "Late deadline",
    "early": "Early deadline",
}


def breaks_between(cal: Calendar, a: str, b: str) -> list[str]:
    """Name the breaks that overlap the time between two date strings."""
    return sorted({name for s, e, name in cal.breaks if s <= day(b) and e >= day(a)})


def calendar_events(cal: Calendar) -> list[CalendarEvent]:
    """Breaks, holidays and finals, as (start, end, name), in date order."""
    ev = [(s, e, n) for s, e, n in cal.breaks]
    ev += [(d, d, n) for d, n in cal.holidays.items() if not cal.in_break(d)]
    if cal.finals:
        ev.append((cal.finals[0], cal.finals[1], "Finals"))
    return sorted(ev)


def event_row(ev: CalendarEvent, side: str) -> str:
    """Format a break, holiday, or finals as a table row in one term's columns."""
    s, e, name = ev
    when = f"{WEEKDAYS[s.weekday()]}, {s:%b} {s.day}" + (
        "" if s == e else f" \u2013 {WEEKDAYS[e.weekday()]}, {e:%b} {e.day}"
    )
    cells = [f"*{when}*", "", "", ""] if side == "old" else ["", "", f"*{when}*", ""]
    return f"| *{name}* | | " + " | ".join(cells) + " | |"


def cmd_report(args: argparse.Namespace) -> None:
    """Build the table of where each assessment moved, for the review."""
    src, dst = Calendar(args.from_), Calendar(args.to)
    plan = defaultdict(dict)
    for r in read_plan(args.plan):
        plan[r["file"]][r["path"]] = r
    rows, undated, label_counts, late_count = [], [], defaultdict(int), [0]
    for rel, path in json_files(args.ci):
        data = json.loads(read_text(path))
        if rel == "infoCourseInstance.json":
            continue
        roles = {p: v for p, v in date_roles(data).items() if p in plan.get(rel, {})}
        if not roles:
            undated.append(data.get("title") or short(rel))
            continue
        by_role = {kind: plan[rel][p] for p, (kind, _) in reversed(roles.items())}
        rel_r, due_r, close_r = (
            by_role.get("release"),
            by_role.get("due"),
            by_role.get("closes"),
        )
        notes = []
        for p, (kind, _) in roles.items():
            r = plan[rel][p]
            what = KIND_WORDS[kind]
            reason = (r.get("reason") or "").strip()
            o, n = stamp(r["old"]), stamp(r["new"])
            if src.stale(o.date()):
                notes.append(
                    f"{what} was left over from {o.year}"
                    + (f": {reason}" if reason else "")
                )
                continue
            loc = src.locate(o.date())
            if loc[0] == "break":
                notes.append(f"{what} fell in {src.in_break(o.date()).lower()}")
            mapped, _ = dst.place(loc)
            diffs = []
            if n.weekday() != o.weekday():
                diffs.append(
                    f"{DAY_NAMES[n.weekday()]} instead of {DAY_NAMES[o.weekday()]}"
                )
            if n.time() != o.time():
                diffs.append(f"{n:%H:%M} instead of {o:%H:%M}")
            by_hand = mapped is not None and n.date() != mapped
            if diffs or by_hand:
                text = f"{what} " + (", ".join(diffs) if diffs else "moved by hand")
                if reason:
                    text += f": {reason}"
                elif by_hand:
                    text += f" (calendar rule gave {fmt(mapped.isoformat() + r['old'][10:], with_time=False)})"
                notes.append(text)
            elif reason:
                notes.append(f"{what}: {reason}")
            if n.date() in dst.holidays:
                notes.append(f"{what} now on {dst.holidays[n.date()]}")
            if dst.in_break(n.date()):
                notes.append(f"{what} now in {dst.in_break(n.date()).lower()}")
            if (
                dst.end
                and dst.end < n.date()
                and (not dst.finals or n.date() < dst.finals[0])
            ):
                notes.append(f"{what} now between the last class and finals")
        if rel_r and due_r:
            ob, nb = (
                breaks_between(src, rel_r["old"], due_r["old"]),
                breaks_between(dst, rel_r["new"], due_r["new"]),
            )
            od = (stamp(due_r["old"]) - stamp(rel_r["old"])).days
            nd_ = (stamp(due_r["new"]) - stamp(rel_r["new"])).days
            if od != nd_:
                gained = [b.lower() for b in nb if b not in ob]
                lost = [b.lower() for b in ob if b not in nb]
                if gained:
                    notes.append(
                        f"Now spans {', '.join(gained)}: open {nd_} days, was {od}"
                    )
                elif lost:
                    notes.append(
                        f"No longer spans {', '.join(lost)}: open {nd_} days, was {od}"
                    )
                else:
                    notes.append(f"Open {nd_} days, was {od}")
        labels = [r for r in (data.get("accessControl") or [])[1:] if "labels" in r]
        for lab in {label for r in labels for label in r["labels"]}:
            label_counts[lab] += 1
        late_count[0] += sum(1 for k, _ in roles.values() if k in ("late", "early"))
        rows.append({
            "set": " ".join(f"{data.get('set', '')} {data.get('number', '')}".split()),
            "title": data.get("title") or short(rel),
            "tid": short(rel),
            "rel": rel_r,
            "due": due_r or close_r,
            "due_kind": "due" if due_r else "closes",
            "notes": list(dict.fromkeys(notes)),
        })
    rows.sort(key=lambda x: (stamp((x["rel"] or x["due"])["new"]), x["set"]))
    out = [f"# {src.term} → {dst.term}: where each assessment moved", ""]
    for cal in (src, dst):
        brk = (
            "; ".join(f"{n} {s:%b %d}\u2013{e:%b %d}" for s, e, n in cal.breaks)
            or "none"
        )
        out.append(
            f"- **{cal.term}:** instruction {cal.begin:%b %d} \u2013 {cal.end:%b %d}"
            if cal.end
            else f"- **{cal.term}:** instruction from {cal.begin:%b %d}"
        )
        out[-1] += f"; breaks: {brk}" + (
            f"; finals {cal.finals[0]:%b %d}\u2013{cal.finals[1]:%b %d}"
            if cal.finals
            else ""
        )
    ci_plan = plan.get("infoCourseInstance.json", {})
    pub = [ci_plan.get(f"publishing.{k}") for k in ("startDate", "endDate")]
    if all(pub):
        out.append(
            f"- **Course instance open:** {fmt(pub[0]['old'], with_time=False)} \u2013 {fmt(pub[1]['old'], with_time=False)} → {fmt(pub[0]['new'], with_time=False)} \u2013 {fmt(pub[1]['new'], with_time=False)}"
        )
    out += [
        "",
        "| Assessment | ID | Current release | Current due | New release | New due | Notes |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    old_events, new_events = calendar_events(src), calendar_events(dst)
    for x in rows:
        first = x["rel"] or x["due"]
        old_day, new_day = day(first["old"]), day(first["new"])
        stale_row = src.stale(old_day)
        for ev in [e for e in old_events if not stale_row and e[0] <= old_day]:
            out.append(event_row(ev, "old"))
            old_events.remove(ev)
        for ev in [e for e in new_events if e[0] <= new_day]:
            out.append(event_row(ev, "new"))
            new_events.remove(ev)
        r, d = x["rel"], x["due"]
        closes = " (closes)" if d and x["due_kind"] == "closes" else ""
        cells = [
            fmt(r["old"]) if r else "\u2013",
            (fmt(d["old"]) + closes) if d else "\u2013",
            fmt(r["new"]) if r else "\u2013",
            (fmt(d["new"]) + closes) if d else "\u2013",
        ]
        out.append(
            f"| {x['title']} | `{x['tid']}` | "
            + " | ".join(cells)
            + f" | {'. '.join(x['notes'])} |"
        )
    out += [event_row(ev, "old") for ev in sorted(old_events)]
    out += [event_row(ev, "new") for ev in sorted(new_events)]
    if undated:
        out += [
            "",
            f"**No dates in PrairieLearn ({len(undated)}):** "
            + ", ".join(sorted(undated)),
        ]
    noted = sum(1 for x in rows if x["notes"])
    out += ["", f"{len(rows)} assessments with dates, {noted} with notes."]
    if late_count[0]:
        out.append(
            f"Late and early deadlines ({late_count[0]}) moved by the same rule."
        )
    for lab, n in sorted(label_counts.items()):
        out.append(
            f'Overrides for the "{lab}" student label ({n} assessments) moved with their assessments.'
        )
    text = "\n".join(out) + "\n"
    if args.md:
        write_text(args.md, text)
        print(f"Wrote {args.md}: {len(rows)} assessments, {noted} with notes")
    else:
        print(text)


def main() -> None:
    """Parse the command line and run the chosen command."""
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("ci")
    s.add_argument("--calendar", help="calendar of the term this instance is for")
    p = sub.add_parser("plan")
    p.add_argument("ci")
    p.add_argument("--from", dest="from_", required=True)
    p.add_argument("--to", required=True)
    p.add_argument("--csv")
    a = sub.add_parser("apply")
    a.add_argument("ci")
    a.add_argument("--plan", required=True)
    t = sub.add_parser("strip")
    t.add_argument("ci")
    r = sub.add_parser(
        "report", help="table of where each assessment moved, for the review"
    )
    r.add_argument("ci")
    r.add_argument("--plan", required=True)
    r.add_argument("--from", dest="from_", required=True)
    r.add_argument("--to", required=True)
    r.add_argument("--md", help="write the table to this Markdown file")
    args = ap.parse_args()
    {
        "scan": cmd_scan,
        "plan": cmd_plan,
        "apply": cmd_apply,
        "strip": cmd_strip,
        "report": cmd_report,
    }[args.cmd](args)


if __name__ == "__main__":
    main()

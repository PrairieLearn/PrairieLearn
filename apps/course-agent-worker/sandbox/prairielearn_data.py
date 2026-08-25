"""Course-scoped, structured PrairieLearn data client for sandbox analysis."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

COURSE_DATA_ORIGIN = "https://course-data.internal"
DATA_ROOT = Path("/workspace/data")
QUERY_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")


class CourseDataError(RuntimeError):
    """Raised when a structured course-data request or artifact operation fails."""


def _request(path: str, *, method: str = "GET", body: Any | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        f"{COURSE_DATA_ORIGIN}{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": "Bearer proxy-injected",
            **({"Content-Type": "application/json"} if data is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        message = error.read().decode(errors="replace")
        raise CourseDataError(
            f"PrairieLearn course-data request failed ({error.code}): {message}"
        ) from error
    except urllib.error.URLError as error:
        raise CourseDataError(
            f"PrairieLearn course-data request failed: {error.reason}"
        ) from error


def list_resources() -> list[dict[str, Any]]:
    """Return the semantic resources available to the current course-agent run."""
    return _request("/resources")["resources"]


def describe_resource(resource: str) -> dict[str, Any]:
    """Return field and operation metadata for one semantic resource."""
    return _request(f"/resources/{resource}")


def result_directory(query_id: str) -> Path:
    """Resolve a validated query ID below the fixed artifact root."""
    if not QUERY_ID_PATTERN.fullmatch(query_id):
        raise CourseDataError("Invalid query ID")
    return DATA_ROOT / query_id


def materialize_query(query: dict[str, Any]) -> tuple[dict[str, Any], Path]:
    """Execute a structured query and materialize its bounded result as JSON."""
    response = _request("/query", method="POST", body=query)
    directory = result_directory(response["queryId"])
    directory.mkdir(parents=True, exist_ok=True)

    (directory / "query.json").write_text(json.dumps(query, indent=2) + "\n")
    (directory / "schema.json").write_text(
        json.dumps(
            {
                "queryId": response["queryId"],
                "resource": response["resource"],
                "columns": response["columns"],
                "rowCount": response["rowCount"],
                "truncated": response["truncated"],
            },
            indent=2,
        )
        + "\n"
    )

    artifact_path = directory / "result.json"
    artifact_path.write_text(json.dumps(response["rows"], indent=2) + "\n")
    return response, artifact_path


@dataclass(frozen=True)
class CourseDataResult:
    """A materialized course-data query result."""

    query_id: str
    artifact_path: Path
    row_count: int
    truncated: bool

    def rows(self) -> list[dict[str, Any]]:
        """Load the bounded rows from the local JSON artifact."""
        return json.loads(self.artifact_path.read_text())


class CourseDataQuery:
    """Fluent builder for the allowlisted PrairieLearn query contract."""

    def __init__(self, resource: str) -> None:
        self._query: dict[str, Any] = {
            "resource": resource,
            "select": [],
            "where": [],
            "groupBy": [],
            "metrics": [],
            "orderBy": [],
            "limit": 1000,
        }

    def select(self, *fields: str) -> CourseDataQuery:
        self._query["select"] = list(fields)
        return self

    def where(self, field: str, op: str, value: Any) -> CourseDataQuery:
        self._query["where"].append({"field": field, "op": op, "value": value})
        return self

    def group_by(self, *fields: str) -> CourseDataQuery:
        self._query["groupBy"] = list(fields)
        return self

    def metric(
        self, op: str, *, alias: str, field: str | None = None
    ) -> CourseDataQuery:
        metric = {"op": op, "as": alias}
        if field is not None:
            metric["field"] = field
        self._query["metrics"].append(metric)
        return self

    def order_by(self, field: str, direction: str = "asc") -> CourseDataQuery:
        self._query["orderBy"].append({"field": field, "direction": direction})
        return self

    def limit(self, rows: int) -> CourseDataQuery:
        self._query["limit"] = rows
        return self

    def collect(self) -> CourseDataResult:
        response, artifact_path = materialize_query(self._query)
        return CourseDataResult(
            query_id=response["queryId"],
            artifact_path=artifact_path,
            row_count=response["rowCount"],
            truncated=response["truncated"],
        )


class CourseData:
    """Entry point for course-scoped semantic data discovery and querying."""

    def resources(self) -> list[dict[str, Any]]:
        return list_resources()

    def describe(self, resource: str) -> dict[str, Any]:
        return describe_resource(resource)

    def table(self, resource: str) -> CourseDataQuery:
        return CourseDataQuery(resource)

"""Post or update a CI report comment on a pull request.

Reads section markdown files from a directory and upserts them into a single
PR comment identified by a hidden marker. Uses the `gh` CLI for GitHub API
calls (authenticated via GH_TOKEN).

Usage:
    python scripts/ci-report-comment.py <report-dir> <repo> <run-id>
"""

import json
import re
import subprocess
import sys
from pathlib import Path

_MARKER = "<!-- ci-report -->"
_SECTION_PATTERN = re.compile(r"(<!-- ([\w-]+) -->.*?<!-- /\2 -->)", re.DOTALL)


def _gh(*args: str) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, check=True)
    return result.stdout.strip()


def _get_pr_number(repo: str, run_id: str) -> str | None:
    raw = _gh(
        "api",
        f"repos/{repo}/actions/runs/{run_id}",
        "--jq",
        ".pull_requests[0].number // .head_sha",
    )
    if not raw:
        return None
    if raw.isdigit():
        return raw
    # pull_requests is empty for fork PRs; fall back to finding the PR by commit SHA.
    raw = _gh(
        "api",
        f"repos/{repo}/commits/{raw}/pulls",
        "--jq",
        ".[0].number // empty",
    )
    return raw or None


def find_existing_comment(repo: str, pr_number: str) -> tuple[str | None, str]:
    """Return (comment_id, body) of the existing CI report comment, or (None, "")."""
    raw = _gh(
        "api",
        "--paginate",
        f"repos/{repo}/issues/{pr_number}/comments?per_page=100",
        "--jq",
        f'map(select(.user.login == "github-actions[bot]" and (.body | contains("{_MARKER}"))))[0] // empty',
    )
    if not raw:
        return None, ""
    data = json.loads(raw)
    return str(data["id"]), data["body"]


def upsert_section(body: str, section: str) -> str:
    """Replace an existing section in body, or append it."""
    match = _SECTION_PATTERN.search(section)
    if not match:
        return body + "\n" + section if body else section

    section_name = match.group(2)
    start_marker = f"<!-- {section_name} -->"
    end_marker = f"<!-- /{section_name} -->"

    if start_marker in body:
        pattern = re.compile(
            re.escape(start_marker) + r".*?" + re.escape(end_marker), re.DOTALL
        )
        return pattern.sub(section, body)

    return body + "\n" + section


def main() -> None:
    """Entry point for the CI report comment script."""
    report_dir, repo, run_id = Path(sys.argv[1]), sys.argv[2], sys.argv[3]

    if not report_dir.is_dir() or not any(report_dir.iterdir()):
        print("No CI report artifacts found — nothing to do.")
        return

    pr_number = _get_pr_number(repo, run_id)
    if not pr_number:
        raise RuntimeError(f"Could not determine PR number from workflow run {run_id}")

    print(f"PR #{pr_number}")

    comment_id, body = find_existing_comment(repo, pr_number)

    for section_file in sorted(report_dir.glob("*.md")):
        section = section_file.read_text()
        if not body:
            body = _MARKER + "\n" + section
        else:
            body = upsert_section(body, section)

    if not body:
        raise RuntimeError(f"No .md section files found in {report_dir}")

    if comment_id:
        _gh(
            "api",
            "--method",
            "PATCH",
            f"repos/{repo}/issues/comments/{comment_id}",
            "-f",
            f"body={body}",
        )
        print(f"Updated comment {comment_id}")
    else:
        _gh(
            "api",
            "--method",
            "POST",
            f"repos/{repo}/issues/{pr_number}/comments",
            "-f",
            f"body={body}",
        )
        print("Created new comment")


if __name__ == "__main__":
    main()

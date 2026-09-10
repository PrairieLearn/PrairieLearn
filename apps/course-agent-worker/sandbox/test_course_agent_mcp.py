"""Exercise MCP outcomes and Git reconciliation without remote services."""

import io
import json
import os
import subprocess
import tempfile
import unittest
import urllib.error
from email.message import Message
from pathlib import Path
from typing import Never, cast
from unittest.mock import patch
from urllib.request import Request

import course_agent_mcp as mcp
import pytest


class PushSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="pl-mcp-test-")
        self.addCleanup(self.directory.cleanup)
        self.previous_cwd = os.getcwd()
        self.addCleanup(os.chdir, self.previous_cwd)
        self.environment = patch.dict(
            os.environ,
            {
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.com",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.com",
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.root = Path(self.directory.name)
        self.git(self.root, "init", "--bare", "-b", "master", "origin.git")
        self.git(self.root, "clone", str(self.root / "origin.git"), "course")
        self.course = self.root / "course"
        (self.course / "README.md").write_text("Initial\n")
        self.git(self.course, "add", ".")
        self.git(self.course, "commit", "-m", "Initial")
        self.git(self.course, "push", "origin", "master")
        self.git(self.root, "clone", str(self.root / "origin.git"), "publisher")
        self.publisher = self.root / "publisher"
        os.chdir(self.course)

    def git(self, cwd: Path, *args: str, stdin: str | None = None) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=cwd,
            input=stdin,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

    def propose(self, number: int = 1) -> None:
        (self.course / "README.md").write_text(f"Update {number}\n")
        self.git(self.course, "add", ".")
        self.git(
            self.course,
            "commit",
            "-m",
            f"Update {number}\n\nCo-authored-by: PrairieLearn Agent (Codex) <agent@example.com>",
        )

    def publish(self, request: Request) -> str:
        proposal = json.loads(cast(bytes, request.data))
        assert self.git(self.publisher, "rev-parse", "HEAD") == proposal["baseSha"]
        self.git(self.publisher, "apply", "--index", "-", stdin=proposal["diff"])
        self.git(self.publisher, "commit", "-m", "Published by PrairieLearn")
        self.git(self.publisher, "push", "origin", "master")
        return self.git(self.publisher, "rev-parse", "HEAD")

    def test_only_push_sync_is_exposed(self) -> None:
        response = mcp._handle({"id": 1, "method": "tools/list"})
        assert response is not None
        assert [tool["name"] for tool in response["result"]["tools"]] == ["push_sync"]

    def test_two_publications_reconcile_prairielearns_new_commits(self) -> None:
        def publish(request: Request) -> io.BytesIO:
            return io.BytesIO(
                json.dumps({"ok": True, "commitSha": self.publish(request)}).encode()
            )

        with patch.object(mcp.urllib.request, "urlopen", side_effect=publish):
            for number in [1, 2]:
                self.propose(number)
                result = mcp._push_sync()
                assert result["ok"]
                assert "checkoutWarning" not in result
                self.git(
                    self.course,
                    "merge-base",
                    "--is-ancestor",
                    result["commitSha"],
                    "HEAD",
                )
                assert self.git(self.course, "diff", "origin/master", "HEAD") == ""
                assert self.git(self.course, "status", "--porcelain") == ""

    def test_denial_does_not_publish_and_is_not_a_tool_error(self) -> None:
        self.propose()
        head = self.git(self.course, "rev-parse", "HEAD")
        denial = {
            "ok": False,
            "denied": True,
            "message": "The instructor denied this proposal.",
        }
        with patch.object(
            mcp.urllib.request,
            "urlopen",
            return_value=io.BytesIO(json.dumps(denial).encode()),
        ):
            response = mcp._handle({
                "id": 1,
                "method": "tools/call",
                "params": {"name": "push_sync"},
            })
        assert response is not None
        assert response["result"]["structuredContent"] == denial
        assert not response["result"]["isError"]
        assert self.git(self.course, "rev-parse", "HEAD") == head

    def test_sync_failure_preserves_log_and_reconciles_published_revision(self) -> None:
        self.propose()

        def failure(request: Request) -> Never:
            sha = self.publish(request)
            body = {
                "error": "Server job log:\nUnknown QID: missing-question",
                "details": {"published": True, "commitSha": sha},
            }
            raise urllib.error.HTTPError(
                request.full_url,
                409,
                "Conflict",
                Message(),
                io.BytesIO(json.dumps(body).encode()),
            )

        with patch.object(mcp.urllib.request, "urlopen", side_effect=failure):
            response = mcp._handle({
                "id": 1,
                "method": "tools/call",
                "params": {"name": "push_sync"},
            })
        assert response is not None
        result = response["result"]
        assert result["isError"]
        assert result["structuredContent"]["published"]
        assert (
            "Server job log:\nUnknown QID: missing-question"
            in result["structuredContent"]["error"]
        )
        assert self.git(self.course, "diff", "origin/master", "HEAD") == ""

    def test_git_errors_include_stderr(self) -> None:
        with pytest.raises(RuntimeError, match="unknown revision"):
            mcp._git("show", "no-such-revision")


if __name__ == "__main__":
    unittest.main()
